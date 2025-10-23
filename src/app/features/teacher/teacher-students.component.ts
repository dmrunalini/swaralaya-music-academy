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
  setLogLevel
} from 'firebase/firestore';

type FeeStatus = 'pending' | 'paid' | 'declined';

type StudentRow = {
  id: string;          // kept for display
  name: string;
  feeStatus?: FeeStatus;
  feeAmount?: number | null;
  uid: string;         // canonical key (student UID/doc id)
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

  ngOnInit(): void {
    if (this.debug) {
      try { setLogLevel('debug'); } catch {}
      this.d('ngOnInit start. currentYm=', this.currentYm, 'currentMonthLabel=', this.currentMonthLabel);
    }

    // Load students from top-level 'students'
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
            uid
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
  }

  ngOnDestroy(): void {
    try { this.stopStudents?.(); } catch {}
    try { this.stopFees?.(); } catch {}
  }

  private rebuildList() {
    this.students = Array.from(this.byId.values()).sort((a, b) =>
      (a.name || a.id).localeCompare(b.name || b.id)
    );
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
        alert(`Scheduling flow for ${s.name} (next 3 months) — implement as needed.`);
        break;
      case 'reviewFee':
        this.openFeeModal(s);
        break;
      case 'inactive':
        this.makeInactive(s);
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

  private async makeInactive(s: StudentRow) {
    if (!confirm(`Make ${s.name} inactive?`)) return;
    this.d('makeInactive', s.uid);
    const ref = doc(this.db, 'students', s.id);
    await setDoc(ref, { active: false, updatedAt: serverTimestamp() } as any, { merge: true });
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
}