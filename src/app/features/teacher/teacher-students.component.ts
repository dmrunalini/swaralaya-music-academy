import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  setLogLevel,
  addDoc
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { DateTime } from 'luxon'; // install luxon if not present

type FeeStatus = 'pending' | 'paid' | 'declined';

type StudentRow = {
  id: string;
  name: string;
  feeStatus?: FeeStatus;
  feeAmount?: number | null;
  uid: string;
  active?: boolean;
};

function ymNow(): string {
  const d = new Date();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, (m || 1) - 1, 1);
  return d.toLocaleString(undefined, { month: 'short', year: 'numeric' }); // e.g., Oct 2025
}

@Component({
  selector: 'app-teacher-students',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-students.component.html',
  styleUrls: ['./teacher-students.component.css']
})
export class TeacherStudentsComponent implements OnInit, OnDestroy {
  loading = true;
  error: string | null = null;

  search = '';
  students: StudentRow[] = [];

  private db = getFirestore();
  private stopStudents?: () => void;
  private stopFees?: () => void;
  private byId = new Map<string, StudentRow>(); // key by uid

  // Debug toggle
  private debug = true;
  private d(...args: any[]) { if (this.debug) console.log('[TeacherStudents]', ...args); }

  // Fee modal state
  feeModalOpen = false;
  selected?: StudentRow;
  readonly currentYm = ymNow();
  readonly currentMonthLabel = monthLabel(ymNow());

  // Inactivate modal state
  inactivateModalOpen = false;
  activateModalOpen = false;
  selectedForActivation?: StudentRow;

  // --- scheduling modal state (added) ---
  scheduleModalOpen = false;
  scheduleStudent?: StudentRow;
  scheduleDate: string = ymNow().slice(0,7) + '-01';
  scheduleStartTime: string = '';
  scheduleTime: string = '';             // <-- make blank by default
  scheduleDurationMinutes: number = 60;
  scheduleAvailableSlots: string[] = [];
  scheduleBusy = false;
  // --- end scheduling modal state ---

  // added for weekly recurring scheduling UI
  weekDayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  timeSlotLabels: string[] = []; // filled on init
  // no default weekday selected
  selectedWeekdays: number[] = [];  // <-- start empty
  recurringPreviewCount: number | null = null;
  recurringConflictsCount = 0;

  // map of studentId -> boolean (true if student already has recurring bookings for next 3 months)
  isStudentRecurringMap: Record<string, boolean> = {};

  // threshold to consider "recurrently booked" (adjust as needed)
  private readonly RECURRING_THRESHOLD = 4;

  // --- creation UI state (added) ---
  creatingNoticeOpen = false;     // shows "creating slots will take a while..."
  creationResultOpen = false;     // shows final result dialog
  createdCount = 0;
  skippedCount = 0;
  creationError: string | null = null;
  // --- end creation UI state ---

  async ngOnInit() {
    if (this.debug) {
      try { setLogLevel('debug'); } catch {}
      this.d('ngOnInit start. currentYm=', this.currentYm, 'currentMonthLabel=', this.currentMonthLabel);
    }

    const studentsRef = collection(this.db, 'students');
    this.stopStudents = onSnapshot(
      studentsRef,
      snap => {
        this.d('students onSnapshot: count=', snap.size);
        const seen = new Set<string>();
        snap.forEach(d => {
          const data = d.data() as any;
          const uid = String(data.uid || d.id);
          const key = uid.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);

          const id = uid;
          const name =
            data.name ||
            data.fullName ||
            data.displayName ||
            [data.firstName, data.lastName].filter(Boolean).join(' ') ||
            data.email || id;

          const existing = this.byId.get(uid);
          const merged: StudentRow = {
            id,
            name,
            feeStatus: existing?.feeStatus ?? 'pending',
            feeAmount: existing?.feeAmount ?? null,
            uid,
            active: data.active
          };
          this.byId.set(uid, merged);
        });

        this.rebuildList();
        this.loading = false;
        this.error = null;
        this.d('students list rebuilt. total=', this.students.length);
      },
      err => {
        console.error('[TeacherStudents] students onSnapshot error:', err);
        this.error = 'Missing or insufficient permissions.';
        this.loading = false;
        this.students = [];
      }
    );

    // Listen for fee status for the current month
    const feesQ = query(
      collectionGroup(this.db, 'months'),
      where('ym', '==', this.currentYm)
    );
    this.stopFees = onSnapshot(
      feesQ,
      snap => {
        snap.forEach(d => {
          const data = d.data() as any;
          // Get student UID from parent path
          const uid = d.ref.parent.parent ? d.ref.parent.parent.id : '';
          if (!uid) return;

          const row = this.byId.get(uid) || { id: uid, name: uid, uid } as StudentRow;
          row.feeStatus = (data.status as FeeStatus) || 'pending';
          row.feeAmount = typeof data.amount === 'number'
            ? data.amount
            : (typeof data.amount === 'string' ? parseFloat(data.amount) : row.feeAmount ?? null);
          this.byId.set(uid, row);
        });
        this.rebuildList();
      },
      err => console.error('[TeacherStudents] months collectionGroup error:', err)
    );

    // build time label list (04:00..20:00, 30-min steps)
    for (let h = 4; h <= 20; h++) {
      this.timeSlotLabels.push(`${h.toString().padStart(2, '0')}:00`);
      this.timeSlotLabels.push(`${h.toString().padStart(2, '0')}:30`);
    }

    // refresh recurring flags (await is now allowed)
    await this.refreshRecurringFlags();
  }

  ngOnDestroy(): void {
    try { this.stopStudents?.(); } catch {}
    try { this.stopFees?.(); } catch {}
  }

  // Open inactivate/activate modal
  openInactivateModal(s: StudentRow) {
    this.selectedForActivation = s;
    this.inactivateModalOpen = true;
  }
  openActivateModal(s: StudentRow) {
    this.selectedForActivation = s;
    this.activateModalOpen = true;
  }
  closeInactivateModal() {
    this.inactivateModalOpen = false;
    this.selectedForActivation = undefined;
  }
  closeActivateModal() {
    this.activateModalOpen = false;
    this.selectedForActivation = undefined;
  }

  private rebuildList() {
    // Sort: active students first, then inactive
    this.students = Array.from(this.byId.values()).sort((a, b) => {
      if ((a.active ?? true) === (b.active ?? true)) {
        return (a.name || a.id).localeCompare(b.name || b.id);
      }
      return (a.active ?? true) ? -1 : 1; // active first
    });
  }

  get filtered(): StudentRow[] {
    const q = this.search.trim().toLowerCase();
    if (!q) return this.students;
    return this.students.filter(s =>
      (s.name || '').toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  }

  onAction(s: StudentRow, action: string) {
    this.d('onAction', action, 'student=', s);
    switch (action) {
      case 'schedule3m':
        // open scheduling modal for this student (single class scheduling)
        this.openScheduleModal(s);
        break;
      case 'reviewFee':
        this.openFeeModal(s);
        break;
      case 'inactive':
        this.openInactivateModal(s);
        break;
      case 'activate':
        this.openActivateModal(s);
        break;
      default:
        break;
    }
  }

  openFeeModal(s: StudentRow) {
    this.d('openFeeModal for', s.uid, s.name, 'current feeStatus=', s.feeStatus, 'feeAmount=', s.feeAmount);
    this.selected = s;
    this.feeModalOpen = true;
  }
  closeFeeModal() {
    this.feeModalOpen = false;
    this.selected = undefined;
  }

  async confirmFee(status: FeeStatus) {
    if (!this.selected) return;
    const uid = this.selected.uid;
    this.d('confirmFee begin', { uid, status, ym: this.currentYm });

    // Optimistic UI update
    const row = this.byId.get(uid);
    if (row) {
      row.feeStatus = status;
      this.byId.set(uid, row);
      this.rebuildList();
      this.d('optimistic UI update applied for', uid, 'status=', status);
    }

    // Persist + read back
    try {
      await this.writeMonthlyFeeStatus(uid, this.currentYm, status);
      this.d('writeMonthlyFeeStatus success for', uid, 'status=', status, 'ym=', this.currentYm);

      // Read back to verify
      const ref = doc(this.db, 'studentFees', uid);
      const snap = await getDoc(ref);
      const data = snap.exists() ? snap.data() as any : null;
      const after = data?.statusByMonth?.[this.currentYm];
      this.d('post-write read-back', { uid, exists: snap.exists(), afterStatus: after, fullDoc: data });
    } catch (e) {
      console.error('[TeacherStudents] writeMonthlyFeeStatus error:', e);
    }

    this.closeFeeModal();
  }

  // Use per-month doc instead of nested map
  private async writeMonthlyFeeStatus(uid: string, ym: string, status: FeeStatus) {
    const ref = doc(this.db, `studentFees/${uid}/months/${ym}`);
    await setDoc(ref, {
      ym,
      status,
      // amount: keep/null or set when you know it
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  // Inactivate student
  async confirmInactivate() {
    if (!this.selectedForActivation) return;
    const ref = doc(this.db, 'students', this.selectedForActivation.id);
    await setDoc(ref, { active: false, updatedAt: serverTimestamp() } as any, { merge: true });
    this.closeInactivateModal();
  }

  // Activate student
  async confirmActivate() {
    if (!this.selectedForActivation) return;
    const ref = doc(this.db, 'students', this.selectedForActivation.id);
    await setDoc(ref, { active: true, updatedAt: serverTimestamp() } as any, { merge: true });
    this.closeActivateModal();
  }

  // Load fee history (last 12 months) for a student
  async loadFeeHistory(uid: string): Promise<{ ym: string; status: FeeStatus; amount?: number|null }[]> {
    const ref = collection(this.db, `studentFees/${uid}/months`);
    // ym format YYYY-MM sorts lexicographically in chronological order
    const snap = await getDocs(query(ref, orderBy('ym', 'desc'), limit(12)));
    return snap.docs.map(d => {
      const data = d.data() as any;
      return {
        ym: data.ym || d.id,
        status: (data.status as FeeStatus) || 'pending',
        amount: typeof data.amount === 'number' ? data.amount : null
      };
    });
  }

  async scheduleRecurringClassesWithOptions(student: StudentRow, options: {
     startDate: Date,
     time: string, // "HH:mm"
     durationMinutes: number,
     daysOfWeek: number[], // [1,3] for Mon/Wed
     count: number,
     teacherTz: string,
     studentTz: string
   }) {
     const { startDate, time, durationMinutes, daysOfWeek, count, teacherTz, studentTz } = options;
     let occurrences: { startUtc: string; endUtc: string }[] = [];
     let dt = DateTime.fromJSDate(startDate, { zone: teacherTz }).set({
       hour: Number(time.split(':')[0]),
       minute: Number(time.split(':')[1])
     });
 
     let added = 0;
     while (added < count) {
       if (daysOfWeek.includes(dt.weekday)) {
         const startUtc = dt.toUTC().toISO();
         const endUtc = dt.plus({ minutes: durationMinutes }).toUTC().toISO();
         occurrences.push({ startUtc, endUtc });
         added++;
       }
       dt = dt.plus({ days: 1 });
     }
 
     // Get teacher UID from Firebase Auth
     const auth = getAuth();
     const teacherId = auth.currentUser?.uid;
     if (!teacherId) throw new Error('Teacher not logged in');
 
     // Write each occurrence to Firestore
     for (const occ of occurrences) {
       await addDoc(collection(this.db, 'classes'), {
         studentId: student.uid,
         teacherId: teacherId,
         startTimeUtc: occ.startUtc,
         endTimeUtc: occ.endUtc,
         status: 'scheduled',
         teacherTz,
         studentTz,
         createdAt: Date.now()
       });
     }
   }

  // Scheduling modal methods (added)
  openScheduleModal(s: StudentRow) {
    this.scheduleStudent = s;
    this.selectedWeekdays = [];     // <-- clear selection
    this.scheduleTime = '';         // <-- keep blank
    this.scheduleDurationMinutes = 60;
    this.scheduleAvailableSlots = [];
    this.scheduleModalOpen = true;
    this.recurringPreviewCount = null;
    this.recurringConflictsCount = 0;
    // don't call previewRecurringSlots() automatically since no selection yet
  }

  // ensure this method exists and properly resets modal state
  closeScheduleModal() {
    this.scheduleModalOpen = false;
    this.scheduleStudent = undefined;
    this.selectedWeekdays = [];
    this.scheduleTime = '';
    this.scheduleDurationMinutes = 60;
    this.recurringPreviewCount = null;
    this.recurringConflictsCount = 0;
    this.scheduleAvailableSlots = [];
    this.scheduleBusy = false;
    // leave creation UI flags alone
  }

  private async fetchTeacherClassesInRange(teacherId: string, fromIso: string, toIso: string) {
    const ref = collection(this.db, 'classes');
    const q = query(ref, where('teacherId', '==', teacherId), where('startTimeUtc', '<', toIso));
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    return docs.filter((c: any) => (c.endTimeUtc ?? '') > fromIso && c.status !== 'cancelled');
  }

  async onScheduleDateOrDurationChange() {
    if (!this.scheduleDate || !this.scheduleDurationMinutes || !this.scheduleStudent) {
      this.scheduleAvailableSlots = [];
      return;
    }
    const auth = getAuth();
    const teacherId = auth.currentUser?.uid;
    if (!teacherId) {
      this.d('onScheduleDateOrDurationChange: teacher not logged in');
      this.scheduleAvailableSlots = [];
      return;
    }

    // Generate candidate 30-min slots between 04:00 and 20:00 (local)
    const candidates: string[] = [];
    for (let h = 4; h <= 20; h++) {
      for (const m of [0, 30]) {
        const localIso = `${this.scheduleDate}T${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:00`;
        // convert to ISO using Date (treats as local) -> UTC ISO
        candidates.push(new Date(localIso).toISOString());
      }
    }

    // fetch booked classes that might overlap this day
    const dayStartUtc = new Date(`${this.scheduleDate}T00:00:00`).toISOString();
    const dayEndUtc = new Date(`${this.scheduleDate}T23:59:59`).toISOString();
    const booked = await this.fetchTeacherClassesInRange(teacherId, dayStartUtc, dayEndUtc);

    const overlaps = (sStartIso: string, sEndIso: string) =>
      booked.some((b: any) => !(sEndIso <= b.startTimeUtc || sStartIso >= b.endTimeUtc));

    // filter candidates by duration
    this.scheduleAvailableSlots = candidates.filter(slotStartIso => {
      const start = new Date(slotStartIso);
      const end = new Date(start.getTime() + this.scheduleDurationMinutes * 60000);
      return !overlaps(start.toISOString(), end.toISOString());
    });
  }

  async scheduleClass() {
    if (!this.scheduleStudent) return;
    if (!this.scheduleStartTime) { alert('Please choose a start time'); return; }
    const auth = getAuth();
    const teacherId = auth.currentUser?.uid;
    if (!teacherId) { alert('Teacher not logged in'); return; }

    this.scheduleBusy = true;
    try {
      const startUtc = new Date(this.scheduleStartTime).toISOString();
      const endUtc = new Date(new Date(this.scheduleStartTime).getTime() + this.scheduleDurationMinutes * 60000).toISOString();

      // conflict check
      const overlapping = await this.fetchTeacherClassesInRange(teacherId, startUtc, endUtc);
      if (overlapping.length) {
        alert('Conflict: teacher already has a class at this time.');
        return;
      }

      // create class doc
      await addDoc(collection(this.db, 'classes'), {
        studentId: this.scheduleStudent.uid,
        teacherId,
        startTimeUtc: startUtc,
        endTimeUtc: endUtc,
        status: 'scheduled',
        createdAt: Date.now()
      });
      // optionally refresh UI by reloading students/classes where relevant
      this.d('Scheduled class for', this.scheduleStudent.uid, startUtc, endUtc);
      this.closeScheduleModal();
    } catch (err) {
      console.error('scheduleClass error', err);
      alert('Failed to schedule class.');
    } finally {
      this.scheduleBusy = false;
    }
  }

  // toggle weekday selection (0 = Sun .. 6 = Sat)
  toggleWeekday(day: number) {
    const idx = this.selectedWeekdays.indexOf(day);
    if (idx >= 0) this.selectedWeekdays.splice(idx, 1);
    else this.selectedWeekdays.push(day);
    // keep array sorted for predictability
    this.selectedWeekdays.sort((a,b) => a - b);
    void this.previewRecurringSlots();
  }

  // preview function: no-op if time or weekdays not chosen
  async previewRecurringSlots() {
    if (!this.scheduleStudent) return;
    // require a chosen time and at least one weekday
    if (!this.scheduleTime || !this.selectedWeekdays || this.selectedWeekdays.length === 0) {
      this.recurringPreviewCount = null;
      this.recurringConflictsCount = 0;
      return;
    }

    const auth = getAuth();
    const teacherId = auth.currentUser?.uid;
    if (!teacherId) { this.recurringPreviewCount = 0; this.recurringConflictsCount = 0; return; }

    const dates = this.getDatesForNext3MonthsByWeekdays(this.selectedWeekdays);
    this.recurringPreviewCount = dates.length;
    this.recurringConflictsCount = 0;

    if (!dates.length) return;

    // fetch teacher classes once for the whole date range
    const fromIso = new Date(dates[0] + 'T00:00:00').toISOString();
    const toIso = new Date(dates[dates.length - 1] + 'T23:59:59').toISOString();
    const booked = await this.fetchTeacherClassesInRange(teacherId, fromIso, toIso);

    let conflicts = 0;
    for (const d of dates) {
      const startUtc = new Date(`${d}T${this.scheduleTime}:00`).toISOString();
      const endUtc = new Date(new Date(`${d}T${this.scheduleTime}:00`).getTime() + this.scheduleDurationMinutes * 60000).toISOString();
      const overlap = booked.some((b: any) => !(endUtc <= b.startTimeUtc || startUtc >= b.endTimeUtc));
      if (overlap) conflicts++;
    }

    this.recurringConflictsCount = conflicts;
  }

  // guard creation: ensure time and weekdays selected
  requestScheduleRecurringClasses() {
    if (!this.scheduleTime) { alert('Please select a start time.'); return; }
    if (!this.selectedWeekdays || this.selectedWeekdays.length === 0) { alert('Please select at least one weekday.'); return; }
    this.scheduleCreateRequested = true;
    void this.scheduleRecurringClasses();
  }

  // schedule weekly occurrences across next 3 months (skips conflicts)
  async scheduleRecurringClasses() {
    // must be explicitly requested
    if (!this.scheduleCreateRequested) {
      console.warn('scheduleRecurringClasses called without explicit request — ignoring.');
      return;
    }
    this.scheduleCreateRequested = false;

    if (!this.scheduleStudent) return;
    const auth = getAuth();
    const teacherId = auth.currentUser?.uid;
    if (!teacherId) { alert('Teacher not logged in'); return; }

    // Capture student data locally BEFORE we close/reset the modal
    const studentUid = this.scheduleStudent.uid;
    const studentName = this.scheduleStudent.name;

    const dates = this.getDatesForNext3MonthsByWeekdays(this.selectedWeekdays);
    if (!dates.length) { alert('No occurrences found'); return; }

    // build occurrences list
    const occurrences = dates.map(date => {
      const startUtc = new Date(`${date}T${this.scheduleTime}:00`).toISOString();
      const endUtc = new Date(new Date(`${date}T${this.scheduleTime}:00`).getTime() + this.scheduleDurationMinutes * 60000).toISOString();
      return { date, startUtc, endUtc };
    });

    // fetch booked classes once for the whole range to speed up conflict checks
    const fromIso = occurrences[0].startUtc;
    const toIso = occurrences[occurrences.length - 1].endUtc;
    const booked = await this.fetchTeacherClassesInRange(teacherId, fromIso, toIso);

    // check conflicts for ALL occurrences first (fail-fast)
    let conflicts = 0;
    for (const occ of occurrences) {
      const overlapping = booked.filter((b: any) => !(occ.endUtc <= b.startTimeUtc || occ.startUtc >= b.endTimeUtc));
      if (overlapping.length) conflicts++;
    }

    this.recurringPreviewCount = occurrences.length;
    this.recurringConflictsCount = conflicts;

    // close the schedule modal before showing any global dialogs
    this.closeScheduleModal();

    if (conflicts > 0) {
      // show result dialog (no creations)
      this.createdCount = 0;
      this.skippedCount = conflicts;
      this.creationError = null;
      this.creationResultOpen = true;
      return;
    }

    // show creating notice modal (non-blocking)
    this.creatingNoticeOpen = true;
    this.creationError = null;
    this.createdCount = 0;
    this.skippedCount = 0;

    // allow UI to render the creating notice
    await new Promise(resolve => setTimeout(resolve, 120));

    // create all occurrences (no conflicts)
    this.scheduleBusy = true;
    let created = 0;
    let skipped = 0;
    try {
      for (const occ of occurrences) {
        try {
          // double-check against booked (using earlier fetched list)
          const overlapping = booked.filter((b: any) => !(occ.endUtc <= b.startTimeUtc || occ.startUtc >= b.endTimeUtc));
          if (overlapping.length) { skipped++; continue; }

          // use captured studentUid (not this.scheduleStudent)
          await addDoc(collection(this.db, 'classes'), {
            studentId: studentUid,
            teacherId,
            startTimeUtc: occ.startUtc,
            endTimeUtc: occ.endUtc,
            status: 'scheduled',
            createdAt: Date.now()
          });
          created++;
        } catch (err) {
          console.error('Failed to create occurrence', occ, err);
          skipped++;
        }
      }

      this.createdCount = created;
      this.skippedCount = skipped;
      await this.refreshRecurringFlags();
    } catch (err) {
      console.error('scheduleRecurringClasses error', err);
      if (typeof err === 'string') this.creationError = err;
      else if (err && (err as any).message) this.creationError = (err as any).message;
      else this.creationError = 'Unknown error';
    } finally {
      this.scheduleBusy = false;
      this.creatingNoticeOpen = false;
      this.creationResultOpen = true;
    }
  }

  // guard to ensure create runs only when explicitly requested
  private scheduleCreateRequested = false;

  // call after scheduling recurring classes successfully
  private async refreshRecurringFlags() {
    const auth = getAuth();
    const teacherId = auth.currentUser?.uid;
    if (!teacherId) return;

    const now = new Date();
    const fromIso = now.toISOString();
    const toIso = new Date(now.getTime() + 90 * 24 * 3600 * 1000).toISOString();

    // fetch teacher's classes in the next 90 days (uses existing helper)
    const classes = await this.fetchTeacherClassesInRange(teacherId, fromIso, toIso);

    const counts = new Map<string, number>();
    classes.forEach((c: any) => {
      if (!c.studentId) return;
      counts.set(c.studentId, (counts.get(c.studentId) || 0) + 1);
    });

    this.isStudentRecurringMap = {};
    counts.forEach((count, studentId) => {
      this.isStudentRecurringMap[studentId] = count >= this.RECURRING_THRESHOLD;
    });
  }

  // safe display helper for template (prevents "object possibly null" errors)
  get displayWeekdays(): string {
    if (!this.selectedWeekdays || this.selectedWeekdays.length === 0) return '—';
    return this.selectedWeekdays
      .map(i => this.weekDayLabels[i] ?? '')
      .filter(Boolean)
      .join(', ');
  }

  getDatesForNext3MonthsByWeekdays(weekdays: number[]): string[] {
    const results: string[] = [];
    if (!weekdays || weekdays.length === 0) return results;
    const today = new Date();
    const end = new Date(today.getTime() + 90 * 24 * 3600 * 1000); // 90 days ahead
    for (let cur = new Date(today); cur <= end; cur.setDate(cur.getDate() + 1)) {
      if (weekdays.includes(cur.getDay())) {
        results.push(new Date(cur).toISOString().slice(0, 10)); // YYYY-MM-DD
      }
    }
    return results;
  }

  // helper: true when every occurrence conflicts
  get isAllOccurrencesConflict(): boolean {
    return this.recurringPreviewCount !== null
      && this.recurringPreviewCount > 0
      && this.recurringPreviewCount === this.recurringConflictsCount;
  }
}