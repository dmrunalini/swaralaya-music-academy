import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ScheduleService } from './schedule.service';
import { AuthService } from '../../core/services/auth.service';
import { localToUtcIso, utcIsoToLocalLabel } from '../../shared/tz.util';

@Component({
  selector: 'app-teacher-schedule',
  templateUrl: './teacher-schedule.component.html',
  styleUrls: ['./teacher-schedule.component.scss'],
  // no local providers
})
export class TeacherScheduleComponent {
  form: FormGroup;
  currentUser: any;

  constructor(
    private fb: FormBuilder,
    private scheduleSvc: ScheduleService,
    private auth: AuthService
  ) {
    this.form = this.fb.group({
      studentId: ['', Validators.required],
      startLocal: ['', Validators.required],
      endLocal: ['', Validators.required]
    });

    this.auth.user$.subscribe(user => {
      this.currentUser = user;
    });
  }

  // When saving a class created by teacher
  async saveClass() {
    const teacherTz = this.currentUser?.timezone || 'UTC'; // e.g., 'EST'
    const startUtc = localToUtcIso(this.form.value.startLocal as string, teacherTz);
    const endUtc   = localToUtcIso(this.form.value.endLocal as string, teacherTz);
    await this.scheduleSvc.createClass({
      teacherUid: this.currentUser!.uid,
      studentId: this.form.value.studentId,
      startUtc,
      endUtc
    });
  }

  // When listing classes for the teacher
  displayStart(c: { startUtc: string }) {
    const teacherTz = this.currentUser?.timezone || 'UTC';
    return utcIsoToLocalLabel(c.startUtc, teacherTz, 'MMM d, yyyy h:mm a zzz');
  }
}