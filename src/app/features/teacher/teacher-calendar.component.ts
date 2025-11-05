import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  documentId
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

type ClassDoc = {
  id?: string;
  studentId?: string;
  studentName?: string;
  teacherId?: string;
  startTimeUtc: string;
  endTimeUtc: string;
  status?: 'scheduled' | 'cancelled' | 'blocked';
};

@Component({
  selector: 'app-teacher-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './teacher-calendar.component.html',
  styleUrls: ['./teacher-calendar.component.css']
})
export class TeacherCalendarComponent implements OnInit {
  db = getFirestore();

  calendarDays: Date[] = [];
  timeSlots: string[] = [];
  bookedClasses: ClassDoc[] = [];
  studentNameMap: Record<string, string> = {};
  tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // week navigation
  weekOffset = 0; // 0 = current week, +/- n weeks

  // Add class modal state
  showAddClassModal = false;
  newClass: { date: string; startTime: string; durationMinutes: number; studentId?: string } = {
    date: '',
    startTime: '',
    durationMinutes: 60
  };
  availableSlots: string[] = [];
  busy = false;

  // Reschedule modal state
  showRescheduleModal = false;
  selectedClass: ClassDoc | null = null;

  // reschedule helpers
  rescheduleDate = '';
  rescheduleStartTime = '';
  rescheduleDurationMinutes = 60;
  rescheduleAvailableSlots: string[] = [];
  reschedulePreviewCount: number | null = null;
  rescheduleAvailable = false;
  rescheduleResultOpen = false;
  rescheduleResultMessage = '';
  

  // students dropdown
  studentsList: { id: string; name: string }[] = [];

  constructor() {}

  async ngOnInit(): Promise<void> {
    this.buildTimeSlots();
    await this.loadStudents();        // load students for dropdown
    await this.refreshWeek();
  }

  // fetch students for the dropdown (adjust collection name if different)
  private async loadStudents() {
    try {
      const snap = await getDocs(collection(this.db, 'students'));
      this.studentsList = snap.docs.map(d => {
        const data: any = d.data();
        // try several possible name fields
        const candidate =
          data?.name ||
          data?.displayName ||
          data?.fullName ||
          (data?.firstName && data?.lastName && `${data.firstName} ${data.lastName}`) ||
          data?.firstName ||
          data?.lastName ||
          data?.studentName ||
          data?.profile?.name ||
          data?.profile?.displayName ||
          null;
        const name = candidate && String(candidate).trim() ? String(candidate).trim() : d.id;
        return { id: d.id, name };
      }).sort((a, b) => a.name.localeCompare(b.name));
    } catch (err) {
      console.error('loadStudents error', err);
      this.studentsList = [];
    }
  }

  // add this helper to populate timeSlots (04:00..20:00, 30-min steps)
  private buildTimeSlots() {
    this.timeSlots = [];
    for (let h = 4; h <= 20; h++) {
      this.timeSlots.push(`${h.toString().padStart(2, '0')}:00`);
      this.timeSlots.push(`${h.toString().padStart(2, '0')}:30`);
    }
  }

  prepareCalendarDays(offsetWeeks = 0) {
    const today = new Date();
    // shift by offsetWeeks
    const base = new Date(today);
    base.setDate(base.getDate() + offsetWeeks * 7);

    const startOfWeek = new Date(base);
    startOfWeek.setDate(base.getDate() - base.getDay()); // Sunday of that week

    this.calendarDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      // normalize to midnight local
      d.setHours(0, 0, 0, 0);
      return d;
    });
  }

  async refreshWeek() {
    this.prepareCalendarDays(this.weekOffset);
    await this.loadBookedClassesForWeek();
  }

  async prevWeek() {
    this.weekOffset--;
    await this.refreshWeek();
  }

  async nextWeek() {
    this.weekOffset++;
    await this.refreshWeek();
  }

  get currentWeekLabel(): string {
    if (!this.calendarDays || this.calendarDays.length === 0) return '';
    const start = this.calendarDays[0];
    const end = this.calendarDays[this.calendarDays.length - 1];
    return `${start.toLocaleDateString()} — ${end.toLocaleDateString()}`;
  }

  // Fetch teacher classes in range (single-field query + client filter)
  private async fetchTeacherClassesInRange(teacherId: string, fromIso: string, toIso: string) {
    const ref = collection(this.db, 'classes');
    const q = query(ref, where('teacherId', '==', teacherId));
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ClassDoc[];
    return docs.filter(
      c =>
        c.status !== 'cancelled' &&
        (c.endTimeUtc ?? '') > fromIso &&
        (c.startTimeUtc ?? '') < toIso
    );
  }

  async loadBookedClassesForWeek() {
    const auth = getAuth();
    const teacherId = auth.currentUser?.uid;
    if (!teacherId) {
      this.bookedClasses = [];
      return;
    }

    const fromIso =
      this.calendarDays.length > 0
        ? new Date(this.calendarDays[0].toISOString().slice(0, 10) + 'T00:00:00').toISOString()
        : new Date().toISOString();
    const toIso =
      this.calendarDays.length > 0
        ? new Date(this.calendarDays[this.calendarDays.length - 1].toISOString().slice(0, 10) + 'T23:59:59').toISOString()
        : new Date().toISOString();

    // fetch class docs for teacher (client-side range filter)
    const docs = await this.fetchTeacherClassesInRange(teacherId, fromIso, toIso);
    this.bookedClasses = docs;

    // collect student ids that need resolution
    const ids = Array.from(new Set(this.bookedClasses.map(c => c.studentId).filter(Boolean) as string[]));
    if (ids.length === 0) {
      // attach fallback names if any classes already had studentName
      this.bookedClasses = this.bookedClasses.map(c => ({ ...c, studentName: c.studentName ?? 'Student' }));
      return;
    }

    // helper: batch fetch names from a collection by doc id (uses 'in' queries, chunks of 10)
    const fetchNamesFromCollection = async (colName: string, idsToFetch: string[]) => {
      const map: Record<string, string> = {};
      if (!idsToFetch || idsToFetch.length === 0) return map;
      for (let i = 0; i < idsToFetch.length; i += 10) {
        const chunk = idsToFetch.slice(i, i + 10);
        const q = query(collection(this.db, colName), where(documentId(), 'in', chunk));
        const snap = await getDocs(q);
        snap.docs.forEach(d => {
          const data: any = d.data();
          // try multiple possible name fields
          const nameCandidate =
            (data && (data.name || data.displayName || data.fullName || data['studentName'])) ||
            (data && data.firstName && data.lastName && `${data.firstName} ${data.lastName}`) ||
            (data && data.profile && (data.profile.name || data.profile.displayName)) ||
            null;

          if (nameCandidate && String(nameCandidate).trim()) {
            map[d.id] = String(nameCandidate);
          } else {
            // fallback to id but also log the raw doc for debugging
            map[d.id] = d.id;
            console.debug(`student name not found in ${colName}/${d.id}`, data);
          }
        });
      }
      return map;
    };

    // First try 'students' collection
    let resolved: Record<string, string> = await fetchNamesFromCollection('students', ids);

    // If some ids remain unresolved try 'users' as fallback
    const unresolved = ids.filter(id => !resolved[id]);
    if (unresolved.length > 0) {
      const fromUsers = await fetchNamesFromCollection('users', unresolved);
      resolved = { ...resolved, ...fromUsers };
    }

    // Final fallback: use id string
    ids.forEach(id => {
      if (!resolved[id]) resolved[id] = id;
    });

    // cache into studentNameMap and attach to bookedClasses (prefer class.studentName if present)
    this.studentNameMap = { ...this.studentNameMap, ...resolved };
    this.bookedClasses = this.bookedClasses.map(c => ({
      ...c,
      studentName: (c.studentName && String(c.studentName).trim()) ? c.studentName : (c.studentId ? (this.studentNameMap[c.studentId] || c.studentId) : 'Student')
    }));

    // DEBUG: inspect resolved classes and names
    console.log('bookedClasses (resolved):', this.bookedClasses.map(c => ({
      id: c.id,
      studentId: c.studentId,
      studentName: c.studentName,
      start: c.startTimeUtc,
      end: c.endTimeUtc
    })));
  }

  getBookedForDay(day: Date) {
    const dayKey = day.toISOString().slice(0, 10);
    return this.bookedClasses
      .filter(c => c.startTimeUtc.slice(0, 10) === dayKey)
      .sort((a, b) => a.startTimeUtc.localeCompare(b.startTimeUtc));
  }

  // Add class modal helpers
  openAddClassModal(dateIso?: string) {
    this.newClass = {
      date: dateIso ?? '',
      startTime: '',
      durationMinutes: 60
    };
    this.availableSlots = [];
    this.showAddClassModal = true;
    // don't call onDateOrDurationChange unless user picks date/duration,
    // but if date was provided, compute slots immediately
    if (dateIso) void this.onDateOrDurationChange();
  }

  closeAddClassModal() {
    this.showAddClassModal = false;
    this.newClass = { date: '', startTime: '', durationMinutes: 60 };
    this.availableSlots = [];
    this.busy = false;
  }

  async onDateOrDurationChange() {
    if (!this.newClass.date || !this.newClass.durationMinutes) {
      this.availableSlots = [];
      return;
    }
    // generate candidate 30-min slots local -> ISO
    const candidates: string[] = [];
    for (let h = 4; h <= 20; h++) {
      for (const m of [0, 30]) {
        const localIso = `${this.newClass.date}T${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
        candidates.push(new Date(localIso).toISOString());
      }
    }

    // fetch booked for the day
    const dayStartUtc = new Date(`${this.newClass.date}T00:00:00`).toISOString();
    const dayEndUtc = new Date(`${this.newClass.date}T23:59:59`).toISOString();
    const auth = getAuth();
    const teacherId = auth.currentUser?.uid;
    const booked = teacherId ? await this.fetchTeacherClassesInRange(teacherId, dayStartUtc, dayEndUtc) : [];

    const durationMs = this.newClass.durationMinutes * 60000;
    this.availableSlots = candidates.filter(slotStartIso => {
      const start = new Date(slotStartIso);
      const end = new Date(start.getTime() + durationMs);
      const overlap = booked.some(b => !(end.toISOString() <= b.startTimeUtc || start.toISOString() >= b.endTimeUtc));
      return !overlap;
    });
  }

  async addClass() {
    if (!this.newClass.date || !this.newClass.startTime || !this.newClass.durationMinutes) return;
    this.busy = true;
    try {
      const auth = getAuth();
      const teacherId = auth.currentUser?.uid;
      if (!teacherId) throw new Error('Not logged in');

      const startUtc = new Date(this.newClass.startTime).toISOString();
      const endUtc = new Date(new Date(this.newClass.startTime).getTime() + this.newClass.durationMinutes * 60000).toISOString();

      // conflict check
      const overlapping = await this.fetchTeacherClassesInRange(teacherId, startUtc, endUtc);
      if (overlapping.length) {
        alert('Conflict: teacher already has a class at this time.');
        return;
      }

      await addDoc(collection(this.db, 'classes'), {
        studentId: this.newClass.studentId ?? null,
        teacherId,
        startTimeUtc: startUtc,
        endTimeUtc: endUtc,
        status: 'scheduled',
        createdAt: Date.now()
      });

      await this.loadBookedClassesForWeek();
      this.closeAddClassModal();
    } catch (err) {
      console.error('addClass error', err);
      alert('Failed to add class.');
    } finally {
      this.busy = false;
    }
  }

  // Reschedule helpers
  openRescheduleModal(c: ClassDoc) {
    this.selectedClass = c;
    const start = new Date(c.startTimeUtc);
    this.rescheduleDate = start.toISOString().slice(0, 10);
    // set "HH:mm" so it matches the <option> values
    this.rescheduleStartTime = `${start.getHours().toString().padStart(2,'0')}:${start.getMinutes().toString().padStart(2,'0')}`;
    const end = new Date(c.endTimeUtc);
    this.rescheduleDurationMinutes = Math.round((end.getTime() - start.getTime()) / 60000) || 60;
    this.rescheduleAvailableSlots = [];
    this.reschedulePreviewCount = null;
    this.rescheduleAvailable = false;
    this.showRescheduleModal = true;
    void this.onRescheduleDateOrDurationChange();
  }

  closeRescheduleModal() {
    this.showRescheduleModal = false;
    this.selectedClass = null;
    this.rescheduleAvailableSlots = [];
    this.rescheduleDate = '';
    this.rescheduleStartTime = '';
    this.rescheduleDurationMinutes = 60;
    this.reschedulePreviewCount = null;
    this.rescheduleAvailable = false;
    this.busy = false;
  }

  // reuse fetchTeacherClassesInRange helper from this component
  async onRescheduleDateOrDurationChange() {
    if (!this.selectedClass) return;

    // require date and time selection
    if (!this.rescheduleDate || !this.rescheduleStartTime) {
      this.reschedulePreviewCount = null;
      this.rescheduleAvailable = false;
      return;
    }

    // convert selected start time (one of timeSlots or ISO) to ISO startUtc
    let startIso: string;
    // if user selected a plain time like '09:00' we build local ISO; if rescheduleStartTime already an ISO keep it
    if (/^\d{2}:\d{2}$/.test(this.rescheduleStartTime)) {
      startIso = new Date(`${this.rescheduleDate}T${this.rescheduleStartTime}:00`).toISOString();
    } else {
      // if full ISO string is present, ensure date matches selected date; otherwise build from date+time of ISO
      const tmp = new Date(this.rescheduleStartTime);
      startIso = new Date(`${this.rescheduleDate}T${tmp.getUTCHours().toString().padStart(2,'0')}:${tmp.getUTCMinutes().toString().padStart(2,'0')}:00`).toISOString();
    }

    const durationMs = this.rescheduleDurationMinutes * 60000;
    const endIso = new Date(new Date(startIso).getTime() + durationMs).toISOString();

    const auth = getAuth();
    const teacherId = auth.currentUser?.uid;
    if (!teacherId) { this.rescheduleAvailable = false; this.reschedulePreviewCount = 0; return; }

    // fetch booked for that day once
    const dayStartUtc = new Date(`${this.rescheduleDate}T00:00:00`).toISOString();
    const dayEndUtc = new Date(`${this.rescheduleDate}T23:59:59`).toISOString();
    const booked = await this.fetchTeacherClassesInRange(teacherId, dayStartUtc, dayEndUtc);

    // ignore the selectedClass itself when checking
    const overlap = booked.some(b => {
      if (this.selectedClass && b.id === this.selectedClass.id) return false;
      return !(endIso <= b.startTimeUtc || startIso >= b.endTimeUtc);
    });

    this.reschedulePreviewCount = 1;
    this.rescheduleAvailable = !overlap;
  }

  async rescheduleClass() {
    if (!this.selectedClass || !this.selectedClass.id) return;
    if (!this.rescheduleAvailable) { this.rescheduleResultOpen = true; this.rescheduleResultMessage = 'Selected slot not available.'; return; }

    this.busy = true;
    try {
      const auth = getAuth();
      const teacherId = auth.currentUser?.uid;
      if (!teacherId) throw new Error('Teacher not logged in');

      // build start/end ISOs similar to onRescheduleDateOrDurationChange
      let startIso: string;
      if (/^\d{2}:\d{2}$/.test(this.rescheduleStartTime)) {
        startIso = new Date(`${this.rescheduleDate}T${this.rescheduleStartTime}:00`).toISOString();
      } else {
        const tmp = new Date(this.rescheduleStartTime);
        startIso = new Date(`${this.rescheduleDate}T${tmp.getUTCHours().toString().padStart(2,'0')}:${tmp.getUTCMinutes().toString().padStart(2,'0')}:00`).toISOString();
      }
      const endIso = new Date(new Date(startIso).getTime() + this.rescheduleDurationMinutes * 60000).toISOString();

      // final conflict check (fetch once)
      const booked = await this.fetchTeacherClassesInRange(teacherId, startIso, endIso);
      const conflicts = booked.filter(b => b.id !== this.selectedClass!.id);
      if (conflicts.length) {
        this.rescheduleResultMessage = 'Conflict detected. Reschedule aborted.';
        this.rescheduleResultOpen = true;
        return;
      }

      await updateDoc(doc(this.db, 'classes', this.selectedClass.id), {
        startTimeUtc: startIso,
        endTimeUtc: endIso,
        updatedAt: Date.now()
      });

      await this.loadBookedClassesForWeek();
      this.closeRescheduleModal();
      this.rescheduleResultMessage = 'Slot rescheduled successfully.';
      this.rescheduleResultOpen = true;
    } catch (err) {
      console.error('rescheduleClass error', err);
      this.rescheduleResultMessage = (err && (err as any).message) ? (err as any).message : 'Failed to reschedule.';
      this.rescheduleResultOpen = true;
    } finally {
      this.busy = false;
    }
  }

  async closeAndCancelClass(classId?: string) {
    if (!classId) return;
    if (!confirm('Cancel this class?')) return;
    this.busy = true;
    try {
      await updateDoc(doc(this.db, 'classes', classId), {
        status: 'cancelled',
        updatedAt: Date.now()
      });
      await this.loadBookedClassesForWeek();
      this.closeRescheduleModal();
      this.rescheduleResultMessage = 'Slot cancelled successfully.';
      this.rescheduleResultOpen = true;
    } catch (err) {
      console.error('closeAndCancelClass error', err);
      this.rescheduleResultMessage = (err && (err as any).message) ? (err as any).message : 'Failed to cancel slot.';
      this.rescheduleResultOpen = true;
    } finally {
      this.busy = false;
    }
  }

  // helper to get a display name for a class (falls back to studentId if name not available)
  getStudentDisplay(c: ClassDoc): string {
    if (c.studentName && c.studentName.trim()) return c.studentName;
    if (c.studentId) {
      const name = this.studentNameMap[c.studentId];
      return name && name.trim() ? name : c.studentId;
    }
    return 'Student';
  }

  // computed helper used by template to enable Schedule button
  get isNewClassSlotAvailable(): boolean {
    return !!this.newClass.startTime && this.availableSlots.includes(this.newClass.startTime);
  }
}