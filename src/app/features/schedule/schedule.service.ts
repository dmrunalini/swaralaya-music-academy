import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { getFirestore, addDoc, collection, serverTimestamp, doc, updateDoc, onSnapshot, query, where, deleteDoc } from 'firebase/firestore';
import { Observable } from 'rxjs';

export interface ClassSession {
  id?: string;
  title: string;
  teacherUid: string;
  studentIds: string[];      // supports group
  startUtc: string;          // ISO in UTC
  endUtc: string;            // ISO in UTC
  location?: { type: 'link' | 'room'; value: string }; // e.g., link to /class/:id/video
  notes?: string;
  status?: 'scheduled' | 'cancelled' | 'completed';
  createdAt?: any;
  updatedAt?: any;
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private db = getFirestore();
  private notificationsSubject = new BehaviorSubject<string[]>([]);
  notifications$ = this.notificationsSubject.asObservable();
  private classCompletionStatus: { [key: string]: boolean } = {};

  constructor() {}

  addNotification(notification: string) {
    const currentNotifications = this.notificationsSubject.value;
    this.notificationsSubject.next([...currentNotifications, notification]);
  }

  markClassAsCompleted(classId: string) {
    this.classCompletionStatus[classId] = true;
  }

  isClassCompleted(classId: string): boolean {
    return !!this.classCompletionStatus[classId];
  }

  async createClass(input: ClassSession): Promise<string> {
    const ref = await addDoc(collection(this.db, 'classes'), {
      ...input,
      status: input.status || 'scheduled',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return ref.id;
  }

  async updateClass(id: string, patch: Partial<ClassSession>) {
    await updateDoc(doc(this.db, 'classes', id), { ...patch, updatedAt: serverTimestamp() });
  }

  async cancelClass(id: string, reason?: string) {
    await updateDoc(doc(this.db, 'classes', id), { status: 'cancelled', cancelReason: reason || null, updatedAt: serverTimestamp() });
  }

  async deleteClass(id: string) {
    await deleteDoc(doc(this.db, 'classes', id));
  }

  classesForTeacher(teacherUid: string): Observable<ClassSession[]> {
    return new Observable(sub => {
      const qRef = query(collection(this.db, 'classes'), where('teacherUid', '==', teacherUid)); // sort client-side
      const stop = onSnapshot(qRef, snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ClassSession[];
        items.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
        sub.next(items);
      }, err => sub.error(err));
      return () => stop();
    });
  }

  classesForStudent(studentUid: string): Observable<ClassSession[]> {
    return new Observable(sub => {
      const qRef = query(collection(this.db, 'classes'), where('studentIds', 'array-contains', studentUid));
      const stop = onSnapshot(qRef, snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as ClassSession[];
        items.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
        sub.next(items);
      }, err => sub.error(err));
      return () => stop();
    });
  }

  // Simple reschedule request
  async requestReschedule(classId: string, requesterUid: string, reason: string, proposedTimes: string[]) {
    await addDoc(collection(this.db, 'rescheduleRequests'), {
      classId, requesterUid, reason, proposedTimes, status: 'pending', createdAt: serverTimestamp()
    });
  }

  async respondReschedule(reqId: string, action: 'approved' | 'rejected', note?: string) {
    await updateDoc(doc(this.db, 'rescheduleRequests', reqId), { status: action, note: note || null, updatedAt: serverTimestamp() });
  }
}