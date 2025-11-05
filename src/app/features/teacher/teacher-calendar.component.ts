import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScheduleService, ClassDoc } from '../../services/schedule.service';
import { getAuth } from 'firebase/auth';

@Component({
  selector: 'app-teacher-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './teacher-calendar.component.html',
  styleUrls: ['./teacher-calendar.component.css']
})
export class TeacherCalendarComponent implements OnInit {
  classes: ClassDoc[] = [];
  calendarDays: Date[] = [];
  timeSlots: string[] = []; // labels like "04:00", "04:30" etc.
  weekDays = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  // modal & form state
  showAddClassModal = false;
  newClass: { date: string; startTime: string; durationMinutes: number; studentId?: string } = { date: '', startTime: '', durationMinutes: 60 };
  availableSlots: string[] = [];
  busy = false;
  tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  teacherId = '';

  // reschedule state
  selectedClass: any = null;
  showRescheduleModal: boolean = false;
  rescheduleDate: string = '';
  rescheduleStartTime: string = ''; // ISO string
  rescheduleDurationMinutes: number = 60;
  rescheduleAvailableSlots: string[] = [];

  constructor(private svc: ScheduleService) {
    // 30-min slots 04:00..20:00 labels
    for (let h = 4; h <= 20; h++) {
      this.timeSlots.push(`${h.toString().padStart(2,'0')}:00`);
      this.timeSlots.push(`${h.toString().padStart(2,'0')}:30`);
    }
  }

  async ngOnInit() {
    const auth = getAuth();
    this.teacherId = auth.currentUser?.uid ?? '';
    this.prepareCalendarDays();

    // load classes for next 3 months
    const now = new Date();
    const from = now.toISOString();
    const to = new Date(now.getTime() + 90*24*3600*1000).toISOString();
    this.classes = await this.svc.getClasses(this.teacherId, from, to);
  }

  prepareCalendarDays() {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    this.calendarDays = Array.from({length:7}, (_,i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  }

  // called when date or duration in modal changes
  async onDateOrDurationChange() {
    if (!this.newClass.date || !this.newClass.durationMinutes) {
      this.availableSlots = [];
      return;
    }
    this.availableSlots = await this.svc.getAvailableSlotsForDate(this.teacherId, this.newClass.date, this.newClass.durationMinutes, this.tz);
  }

  openAddClassModal(dateIso?: string, slotIso?: string) {
    this.newClass = { date: dateIso ?? this.newClass.date, startTime: slotIso ?? '', durationMinutes: this.newClass.durationMinutes ?? 60 };
    this.showAddClassModal = true;
    this.onDateOrDurationChange();
  }

  closeAddClassModal() {
    this.showAddClassModal = false;
  }

  // create class using selected available slot (slot is ISO UTC string)
  async addClass() {
    if (!this.newClass.date || !this.newClass.startTime || !this.newClass.durationMinutes) return;
    if (!this.teacherId) { alert('Not logged in'); return; }
    this.busy = true;
    try {
      const startUtc = new Date(this.newClass.startTime).toISOString();
      const endUtc = new Date(new Date(this.newClass.startTime).getTime() + this.newClass.durationMinutes * 60000).toISOString();

      // double-check conflict by fetching overlapping classes
      const overlapping = await this.svc.getClasses(this.teacherId, startUtc, endUtc);
      if (overlapping.length) {
        alert('Conflict: teacher already has a class at this time.');
        return;
      }

      await this.svc.createClass({
        teacherId: this.teacherId,
        studentId: this.newClass.studentId,
        startTimeUtc: startUtc,
        endTimeUtc: endUtc
      } as ClassDoc);

      // refresh local classes for 3 months
      const now = new Date();
      this.classes = await this.svc.getClasses(this.teacherId, now.toISOString(), new Date(now.getTime() + 90*24*3600*1000).toISOString());
      this.closeAddClassModal();
    } finally {
      this.busy = false;
    }
  }

  // reschedule and cancel are similar; sample cancel:
  async cancelClass(c: ClassDoc) {
    if (!c.id) return;
    if (!confirm('Cancel this class?')) return;
    await this.svc.cancelClass(c.id);
    // update local
    c.status = 'cancelled';
  }

  // helper to get classes for a calendar day
  getClassesForDay(day: Date) {
    const dayStr = day.toISOString().slice(0,10);
    return this.classes.filter(c => c.startTimeUtc.slice(0,10) === dayStr && c.status !== 'cancelled');
  }

  // show if class overlaps slot (slot label like "09:30")
  isClassInSlot(c: ClassDoc, slotLabel: string, day: Date) {
    const slotHour = Number(slotLabel.slice(0,2));
    const slotMinute = Number(slotLabel.slice(3,5));
    const slotStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), slotHour, slotMinute).toISOString();
    const slotEnd = new Date(new Date(slotStart).getTime() + 30*60000).toISOString();
    return !(slotEnd <= c.startTimeUtc || slotStart >= c.endTimeUtc);
  }

  openRescheduleModal(c: any) {
    this.selectedClass = c;
    this.showRescheduleModal = true;

    // Prefill date, start and duration
    const start = new Date(c.startTimeUtc);
    const end = new Date(c.endTimeUtc);
    this.rescheduleDate = start.toISOString().slice(0, 10); // YYYY-MM-DD
    this.rescheduleStartTime = c.startTimeUtc; // keep ISO so select can use it
    this.rescheduleDurationMinutes = Math.round((end.getTime() - start.getTime()) / 60000) || 60;

    // load available slots for that date/duration (include current slot)
    this.onRescheduleDateOrDurationChange();
  }

  async onRescheduleDateOrDurationChange() {
    if (!this.rescheduleDate || !this.rescheduleDurationMinutes) {
      this.rescheduleAvailableSlots = [];
      return;
    }
    this.rescheduleAvailableSlots = await this.svc.getAvailableSlotsForDate(
      this.teacherId,
      this.rescheduleDate,
      this.rescheduleDurationMinutes,
      this.tz
    );

    // ensure current class start is present so teacher can keep same slot
    if (this.selectedClass?.startTimeUtc && !this.rescheduleAvailableSlots.includes(this.selectedClass.startTimeUtc)) {
      this.rescheduleAvailableSlots.unshift(this.selectedClass.startTimeUtc);
    }
  }

  closeRescheduleModal() {
    this.showRescheduleModal = false;
    this.selectedClass = null;
    this.rescheduleAvailableSlots = [];
    this.rescheduleDate = '';
    this.rescheduleStartTime = '';
    this.rescheduleDurationMinutes = 60;
  }

  async closeAndCancelClass(classId: string | undefined) {
    if (!classId) return;
    if (!confirm('Are you sure you want to cancel this class?')) return;
    try {
      await this.svc.cancelClass(classId);
      // mark locally if present
      const idx = this.classes.findIndex(x => x.id === classId);
      if (idx >= 0) this.classes[idx].status = 'cancelled';
      this.closeRescheduleModal();
    } catch (err) {
      console.error(err);
      alert('Failed to cancel class.');
    }
  }

  async rescheduleClass() {
    if (!this.selectedClass || !this.selectedClass.id) return;
    const startUtc = new Date(this.rescheduleStartTime).toISOString();
    const endUtc = new Date(new Date(this.rescheduleStartTime).getTime() + this.rescheduleDurationMinutes * 60000).toISOString();

    // conflict check: fetch overlapping classes and ignore the selectedClass itself
    const overlapping = await this.svc.getClasses(this.teacherId, startUtc, endUtc);
    const conflicts = overlapping.filter(c => c.id !== this.selectedClass.id);
    if (conflicts.length) {
      alert('Conflict: teacher already has a class at this time.');
      return;
    }

    try {
      await this.svc.updateClass(this.selectedClass.id, { startTimeUtc: startUtc, endTimeUtc: endUtc });
      // update local
      const idx = this.classes.findIndex(x => x.id === this.selectedClass.id);
      if (idx >= 0) {
        this.classes[idx].startTimeUtc = startUtc;
        this.classes[idx].endTimeUtc = endUtc;
      }
      this.closeRescheduleModal();
    } catch (err) {
      console.error(err);
      alert('Failed to reschedule class.');
    }
  }
}