import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { getFirestore, addDoc, collection, serverTimestamp } from 'firebase/firestore';

@Injectable({ providedIn: 'root' })
export class ScheduleService {
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

  async createClass(input: { teacherUid: string; studentId: string; startUtc: string; endUtc: string }): Promise<string> {
    const db = getFirestore();
    const ref = await addDoc(collection(db, 'classes'), {
      teacherUid: input.teacherUid,
      studentId: input.studentId,
      startUtc: input.startUtc,
      endUtc: input.endUtc,
      status: 'scheduled',
      createdAt: serverTimestamp()
    });
    return ref.id;
  }
}