import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
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
}