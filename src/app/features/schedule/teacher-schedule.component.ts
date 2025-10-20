import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScheduleService, ClassSession } from './schedule.service';
import { AuthService } from '../../core/services/auth.service';
import { localToUtcIso, utcIsoToLocalLabel } from '../../shared/tz.util';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-teacher-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './teacher-schedule.component.html',
  styleUrls: ['./teacher-schedule.component.scss']
})
export class TeacherScheduleComponent implements OnInit, OnDestroy {
  me: any = null;
  tz = 'UTC';

  // create form
  title = '';
  studentIdsCsv = '';
  startLocal = '';
  endLocal = '';
  notes = '';
  busy = false;

  // list
  classes: ClassSession[] = [];
  sub?: Subscription;

  constructor(private auth: AuthService, private svc: ScheduleService) {}

  ngOnInit(): void {
    this.auth.user$.subscribe(u => {
      this.me = u;
      this.tz = u?.timezone || 'UTC';
      if (u?.uid) {
        this.sub?.unsubscribe();
        this.sub = this.svc.classesForTeacher(u.uid).subscribe(v => this.classes = v);
      }
    });
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  fmt(dUtcIso: string) { return utcIsoToLocalLabel(dUtcIso, this.tz, 'MMM d, yyyy h:mm a zzz'); }

  async create() {
    if (!this.me?.uid || !this.title || !this.startLocal || !this.endLocal) return;
    this.busy = true;
    try {
      const startUtc = localToUtcIso(this.startLocal, this.tz);
      const endUtc = localToUtcIso(this.endLocal, this.tz);
      const studentIds = this.studentIdsCsv.split(',').map(s => s.trim()).filter(Boolean);
      const input: ClassSession = {
        title: this.title,
        teacherUid: this.me.uid,
        studentIds,
        startUtc,
        endUtc,
        notes: this.notes,
        location: { type: 'link', value: `/class/VIDEO_${Date.now()}/video` }
      };
      await this.svc.createClass(input);
      this.title = this.studentIdsCsv = this.startLocal = this.endLocal = this.notes = '';
    } finally { this.busy = false; }
  }

  async cancel(c: ClassSession) {
    if (!c.id) return;
    if (!confirm('Cancel this class?')) return;
    await this.svc.cancelClass(c.id, 'Cancelled by teacher');
  }
}