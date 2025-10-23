import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getFirestore, doc, updateDoc, serverTimestamp, query, collection, where, getDocs, onSnapshot, addDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { DateTime } from 'luxon';

@Component({
  selector: 'app-teacher-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-calendar.component.html',
  styleUrls: ['./teacher-calendar.component.css']
})
export class TeacherCalendarComponent {
  private db = getFirestore();
  classes: any[] = [];
  calendarDays: Date[] = [];
  weekDays: string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  selectedClass: any = null;
  showRescheduleModal = false;
  showAddClassModal = false;
  newClass = {
    date: '',
    startTime: '',
    endTime: '',
    studentId: ''
  };
  teacherTz: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
  students: { uid: string; name: string }[] = [];
  timeSlots: string[] = Array.from({ length: 17 }, (_, i) => {
    const hour = 4 + i; // 4 AM to 8 PM (20:00)
    return `${hour.toString().padStart(2, '0')}:00`;
  });

  constructor() {
    // Load classes
    const classesRef = collection(this.db, 'classes');
    onSnapshot(classesRef, snap => {
      this.classes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    });

    // Prepare calendar for current week
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    this.calendarDays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });

    // Load students for dropdown
    const studentsRef = collection(this.db, 'students');
    onSnapshot(studentsRef, snap => {
      this.students = snap.docs.map(d => ({
        uid: d.id,
        name: d.data()['name'] || d.data()['fullName'] || d.data()['displayName'] || d.data()['email'] || d.id
      }));
    });
  }

  getClassesForDay(day: Date): any[] {
    const dayStr = day.toISOString().slice(0, 10);
    return this.classes.filter(c => c.startTimeUtc?.slice(0, 10) === dayStr && c.status !== 'cancelled');
  }

  async cancelClass(classId: string) {
    await updateDoc(doc(this.db, 'classes', classId), {
      status: 'cancelled',
      cancelledAt: serverTimestamp()
    });
  }

  openRescheduleModal(c: any) {
    this.selectedClass = c;
    this.showRescheduleModal = true;
  }

  async rescheduleClass(newStartUtc: string, newEndUtc: string) {
    if (!this.selectedClass) return;
    await updateDoc(doc(this.db, 'classes', this.selectedClass.id), {
      startTimeUtc: newStartUtc,
      endTimeUtc: newEndUtc,
      updatedAt: serverTimestamp()
    });
    this.showRescheduleModal = false;
    this.selectedClass = null;
  }

  openAddClassModal() {
    this.showAddClassModal = true;
    this.newClass = { date: '', startTime: '', endTime: '', studentId: '' };
  }

  closeAddClassModal() {
    this.showAddClassModal = false;
  }

  async addClass() {
    if (!this.newClass.date || !this.newClass.startTime || !this.newClass.endTime || !this.newClass.studentId) return;

    // Combine date and time, convert to UTC ISO string
    const start = new Date(`${this.newClass.date}T${this.newClass.startTime}:00`);
    const end = new Date(`${this.newClass.date}T${this.newClass.endTime}:00`);
    const startUtc = start.toISOString();
    const endUtc = end.toISOString();

    // Get teacherId from Firebase Auth
    const auth = getAuth();
    const teacherId = auth.currentUser?.uid;
    if (!teacherId) {
      alert('Teacher not logged in');
      return;
    }

    await addDoc(collection(this.db, 'classes'), {
      studentId: this.newClass.studentId,
      teacherId,
      startTimeUtc: startUtc,
      endTimeUtc: endUtc,
      status: 'scheduled',
      createdAt: Date.now()
    });

    this.closeAddClassModal();
  }

  getStudentName(uid: string): string {
    const student = this.students.find(s => s.uid === uid);
    return student ? student.name : uid;
  }

  closeAndCancelClass(classId: string) {
    this.cancelClass(classId);
    this.showRescheduleModal = false;
  }

  closeRescheduleModal() {
    this.showRescheduleModal = false;
  }

  getSlotLabel(slot: string): string {
    // slot is "HH:00"
    const today = new Date();
    const dt = DateTime.fromObject({
      year: today.getFullYear(),
      month: today.getMonth() + 1,
      day: today.getDate(),
      hour: Number(slot.slice(0, 2)),
      minute: 0
    }, { zone: this.teacherTz });
    return dt.toFormat('hh:mm a');
  }

  isClassInSlot(c: any, slot: string): boolean {
    if (!c.startTimeUtc || !c.endTimeUtc) return false;
    // slot is "HH:00"
    const slotHour = Number(slot.slice(0, 2));
    const classStart = new Date(c.startTimeUtc);
    const classEnd = new Date(c.endTimeUtc);
    // Check if class overlaps with this slot's hour
    return (
      classStart.getHours() <= slotHour &&
      classEnd.getHours() > slotHour
    ) || (
      classStart.getHours() === slotHour &&
      classStart.getMinutes() === 0
    );
  }
}