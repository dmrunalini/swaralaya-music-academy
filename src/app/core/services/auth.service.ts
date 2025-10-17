import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import { initializeApp, FirebaseApp, getApps } from 'firebase/app';
import {
  getAuth,
  Auth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  reload
} from 'firebase/auth';
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, getDoc, setDoc, query, where, Firestore, getFirestore, onSnapshot } from 'firebase/firestore';
import { FirebaseError } from 'firebase/app';

import { environment } from '../../../environments/environment';

export interface AppUser {
  uid: string;
  name: string;
  email: string;
  role: 'teacher' | 'student';
  gender?: string;
  age?: number;
  timezone?: string;
  phone?: string;
  emailVerified?: boolean;
  lastName?: string;
}

export interface ChildStudent {
  id?: string;
  parentUid: string;       // owner (parent or self)
  firstName: string;
  lastName?: string;
  age?: number;
  level?: string;
  notes?: string;
  assignedTeacherId?: string;
  assignedTeacherEmail?: string;
  isSelf?: boolean;        // <-- marks the parent’s own student record
  parentName?: string;
  parentEmail?: string;
}

export interface TeacherStudentListItem extends ChildStudent {
  parentUid: string;
  parentName?: string;
  parentEmail?: string;
}

export type StudentRequestKind = 'cancel' | 'reschedule';
export type FeeStatus = 'paid' | 'pending' | 'partial';

// Add missing interface to fix TS2552
export interface StudentRequest {
  id?: string;
  parentUid: string;
  studentId: string;
  studentName: string;
  kind: StudentRequestKind;
  reason?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  assignedTeacherId?: string | null;
  assignedTeacherEmail?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface StudentFee {
  id?: string;           // suggested: `${studentId}_${monthKey}`
  parentUid: string;
  studentId: string;
  studentName: string;
  monthKey: string;      // YYYY-MM
  status: FeeStatus;
  amount?: number | null;
  note?: string | null;
  createdAt: number;
  updatedAt: number;

  // Moderation by teacher
  teacherStatus?: 'pending' | 'approved' | 'rejected';
  teacherId?: string | null;
  teacherEmail?: string | null;
  teacherUpdatedAt?: number | null;
  locked?: boolean | null; // true when approved, used to disable further actions
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private app!: FirebaseApp;
  private auth!: Auth;
  private db!: Firestore;

  private userSubject = new BehaviorSubject<AppUser | null>(null);
  user$: Observable<AppUser | null> = this.userSubject.asObservable();

  // map lastName from Firestore too
  private skipNextProfileLoad = false; // avoid reading profile during post-signup signOut

  constructor() {
    // accept either firebaseConfig or firebase key in environment
    const cfg = (environment as any).firebaseConfig ?? (environment as any).firebase;
    if (!cfg) {
      throw new Error('Firebase configuration not found in environment. Add firebaseConfig or firebase to environment.ts');
    }

    if (!getApps().length) {
      this.app = initializeApp(cfg);
    } else {
      this.app = getApps()[0];
    }

    this.auth = getAuth(this.app);
    // Ensure Firestore is initialized
    this.db = getFirestore();

    // listen to auth state
    onAuthStateChanged(this.auth, async (u: User | null) => {
      if (!u) {
        this.userSubject.next(null);
        return;
      }

      // If we are immediately signing out after signup, skip this read once
      if (this.skipNextProfileLoad) {
        this.skipNextProfileLoad = false;
        return;
      }

      try {
        const docRef = doc(this.db, 'users', u.uid);
        const snap = await getDoc(docRef);
        const data = snap.exists() ? (snap.data() as any) : null;
        const appUser: AppUser = {
          uid: u.uid,
          name: data?.name ?? u.displayName ?? '',
          email: u.email ?? '',
          role: data?.role ?? 'student',
          gender: data?.gender,
          age: data?.age,
          timezone: data?.timezone,
          phone: data?.phone,
          emailVerified: u.emailVerified,
          lastName: data?.lastName
        };
        this.userSubject.next(appUser);
      } catch (err: any) {
        // Suppress transient permission error during signOut race
        const code = (err as FirebaseError)?.code;
        if (code !== 'permission-denied') {
          console.debug('Firestore read error in onAuthStateChanged:', err);
        }
      }
    });
  }

  async signUp(payload: {
    name: string;
    lastName?: string;
    email: string;
    password: string;
    role: 'teacher' | 'student';
    gender?: string;
    age?: number;
    timezone?: string;
    phone?: string;
  }): Promise<void> {
    // we will sign out immediately after signup -> skip next profile load
    this.skipNextProfileLoad = true;

    const cred = await createUserWithEmailAndPassword(this.auth, payload.email, payload.password);
    await sendEmailVerification(cred.user);

    const userDoc = {
      uid: cred.user.uid,
      name: payload.name,
      lastName: payload.lastName ?? null,
      email: payload.email,
      role: payload.role,
      gender: payload.gender ?? null,
      age: payload.age ?? null,
      timezone: payload.timezone ?? null,
      phone: payload.phone ?? null
    };
    await setDoc(doc(this.db, 'users', cred.user.uid), userDoc);
  }

  async signIn(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
    this.userSubject.next(null);
  }

  getCurrentAppUser(): AppUser | null {
    return this.userSubject.value;
  }

  async updateProfile(uid: string, updates: Partial<AppUser>) {
    const ref = doc(this.db, 'users', uid);
    await updateDoc(ref, updates as any);
    const cur = this.userSubject.value;
    if (cur) {
      this.userSubject.next({ ...cur, ...updates });
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || !user.email) throw new Error('No signed in user');
    const cred = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPassword);
  }

  // Load the current user's Firestore profile and push to user$
  async loadCurrentUser(): Promise<AppUser | null> {
    const u = this.auth.currentUser;
    if (!u) return null;
    const snap = await getDoc(doc(this.db, 'users', u.uid));
    const data = snap.exists() ? (snap.data() as any) : null;
    const appUser: AppUser = {
      uid: u.uid,
      name: data?.name ?? u.displayName ?? '',
      email: u.email ?? '',
      role: data?.role ?? 'student',
      gender: data?.gender,
      age: data?.age,
      timezone: data?.timezone,
      phone: data?.phone,
      emailVerified: u.emailVerified,
      lastName: data?.lastName
    };
    this.userSubject.next(appUser);
    return appUser;
  }

  // Resend verification email to the signed-in user
  async resendVerificationEmail(): Promise<void> {
    const u = this.auth.currentUser;
    if (!u) throw new Error('No signed in user');
    if (u.emailVerified) return;
    await sendEmailVerification(u);
  }

  // Reload auth user and return true if verified (also refreshes user$)
  async checkEmailVerified(): Promise<boolean> {
    const u = this.auth.currentUser;
    if (!u) return false;
    await reload(u);
    const verified = u.emailVerified;
    if (verified) {
      await this.loadCurrentUser();
    }
    return verified;
  }

  // Children (multi-student) APIs now use top-level 'students'
  async listChildStudents(parentUid: string): Promise<ChildStudent[]> {
    const colRef = collection(this.db, 'students');
    const q = query(colRef, where('parentUid', '==', parentUid));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as ChildStudent) }));
  }

  async addChildStudent(parentUid: string, data: Omit<ChildStudent, 'id' | 'parentUid' | 'isSelf' | 'parentName' | 'parentEmail'>): Promise<string> {
    const colRef = collection(this.db, 'students');
    const cur = this.userSubject.value;
    const docRef = await addDoc(colRef, {
      parentUid,
      firstName: data.firstName,
      lastName: data.lastName ?? null,
      age: data.age ?? null,
      level: data.level ?? null,
      notes: data.notes ?? null,
      assignedTeacherId: data.assignedTeacherId ?? null,
      assignedTeacherEmail: data.assignedTeacherEmail ?? null,
      isSelf: false,
      parentName: cur ? `${cur.name ?? ''} ${cur.lastName ?? ''}`.trim() : null,
      parentEmail: cur?.email ?? null,
      createdAt: Date.now()
    });
    return docRef.id;
  }

  // Create or return the parent’s own student doc
  async ensureSelfStudent(parentUid: string): Promise<ChildStudent> {
    const colRef = collection(this.db, 'students');
    // Query only by parentUid to avoid composite index; filter isSelf client-side
    const snap = await getDocs(query(colRef, where('parentUid', '==', parentUid)));
    const existing = snap.docs.map(d => ({ id: d.id, ...(d.data() as ChildStudent) })).find(s => s.isSelf);
    if (existing) return existing;

    const cur = this.userSubject.value;
    const firstName = (cur?.name || 'Account').toString();
    const lastName = (cur?.lastName || '').toString();

    const ref = await addDoc(colRef, {
      parentUid,
      firstName,
      lastName,
      isSelf: true,
      parentName: cur ? `${cur.name ?? ''} ${cur.lastName ?? ''}`.trim() : null,
      parentEmail: cur?.email ?? null,
      createdAt: Date.now()
    } as ChildStudent);
    return { id: ref.id, parentUid, firstName, lastName, isSelf: true };
  }

  async updateChildStudent(parentUid: string, studentId: string, updates: Partial<ChildStudent>): Promise<void> {
    const ref = doc(this.db, `students/${studentId}`);
    await updateDoc(ref, updates as any);
  }

  async removeChildStudent(parentUid: string, studentId: string): Promise<void> {
    const ref = doc(this.db, `students/${studentId}`);
    await deleteDoc(ref);
  }

  async listAllStudentsForTeacher(): Promise<TeacherStudentListItem[]> {
    const colRef = collection(this.db, 'students');
    const snap = await getDocs(colRef);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as TeacherStudentListItem) }));
  }

  // Create a cancellation or reschedule request for a student
  async createStudentRequest(parentUid: string, student: ChildStudent, input: {
    kind: StudentRequestKind;
    reason?: string;
    preferredDate?: string;
    preferredTime?: string;
  }): Promise<string> {
    const colRef = collection(this.db, 'studentRequests');
    const docRef = await addDoc(colRef, {
      parentUid,
      studentId: student.id!,
      studentName: `${student.firstName} ${student.lastName ?? ''}`.trim(),
      kind: input.kind,
      reason: input.reason ?? null,
      preferredDate: input.preferredDate ?? null,
      preferredTime: input.preferredTime ?? null,
      assignedTeacherId: student.assignedTeacherId ?? null,
      assignedTeacherEmail: student.assignedTeacherEmail ?? null,
      status: 'pending',
      createdAt: Date.now()
    } as StudentRequest);
    return docRef.id;
  }

  // Upsert fee status for current month (or provided monthKey)
  async submitMonthlyFeeStatus(parentUid: string, student: ChildStudent, data: {
    monthKey: string; // 'YYYY-MM'
    status: FeeStatus;
    amount?: number;
    note?: string;
  }): Promise<void> {
    const id = `${student.id}_${data.monthKey}`;
    const ref = doc(this.db, 'studentFees', id);
    const now = Date.now();
    await setDoc(ref, {
      parentUid,
      studentId: student.id!,
      studentName: `${student.firstName} ${student.lastName ?? ''}`.trim(),
      monthKey: data.monthKey,
      status: data.status,
      amount: data.amount ?? null,
      note: data.note ?? null,
      updatedAt: now,
      createdAt: now,
      teacherStatus: 'pending',
      locked: false
    } as StudentFee, { merge: true });
  }

  // Teacher: fetch all fees for a month
  async getMonthlyFeesForAllStudents(monthKey: string): Promise<StudentFee[]> {
    const col = collection(this.db, 'studentFees');
    const qFees = query(col, where('monthKey', '==', monthKey));
    const snap = await getDocs(qFees);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as StudentFee) }));
  }

  // Teacher: approve or reject a fee record
  async teacherSetFeeDecision(feeId: string, decision: 'approved' | 'rejected'): Promise<void> {
    const u = this.auth.currentUser;
    const ref = doc(this.db, 'studentFees', feeId);
    await updateDoc(ref, {
      teacherStatus: decision,
      teacherId: u?.uid ?? null,
      teacherEmail: u?.email ?? null,
      teacherUpdatedAt: Date.now(),
      locked: decision === 'approved'
    });
  }

  // Parent: fetch fees for current month (used on Student Dashboard)
  async getMonthlyFeesForParent(parentUid: string, monthKey: string): Promise<StudentFee[]> {
    const col = collection(this.db, 'studentFees');
    const qFees = query(col, where('parentUid', '==', parentUid), where('monthKey', '==', monthKey));
    const snap = await getDocs(qFees);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as StudentFee) }));
  }

  // Realtime: fees for a parent for a month
  observeMonthlyFeesForParent(parentUid: string, monthKey: string, handler: (fees: StudentFee[]) => void): () => void {
    const col = collection(this.db, 'studentFees');
    const qFees = query(col, where('parentUid', '==', parentUid), where('monthKey', '==', monthKey));
    return onSnapshot(qFees, snap => {
      const fees = snap.docs.map(d => ({ id: d.id, ...(d.data() as StudentFee) }));
      handler(fees);
    });
  }
}