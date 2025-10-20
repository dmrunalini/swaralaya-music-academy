import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScheduleService, ClassSession } from './schedule.service';
import { AuthService } from '../../core/services/auth.service';
import { utcIsoToLocalLabel } from '../../shared/tz.util';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-student-schedule',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './student-schedule.component.html',
  styleUrls: ['./student-schedule.component.scss']
})
export class StudentScheduleComponent implements OnInit, OnDestroy {
  me: any = null;
  tz = 'UTC';
  classes: ClassSession[] = [];
  sub?: Subscription;

  // reschedule request
  selected?: ClassSession;
  reason = '';
  proposed1 = '';
  proposed2 = '';
  proposed3 = '';
  busy = false;

  constructor(private auth: AuthService, private svc: ScheduleService) {}

  ngOnInit(): void {
    this.auth.user$.subscribe(u => {
      this.me = u;
      this.tz = u?.timezone || 'UTC';
      if (u?.uid) {
        this.sub?.unsubscribe();
        this.sub = this.svc.classesForStudent(u.uid).subscribe(v => this.classes = v);
      }
    });
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  fmt(dUtcIso: string) { return utcIsoToLocalLabel(dUtcIso, this.tz, 'MMM d, yyyy h:mm a zzz'); }

  openReschedule(c: ClassSession) { this.selected = c; this.reason = this.proposed1 = this.proposed2 = this.proposed3 = ''; }
  close() { this.selected = undefined; }

  async sendRequest() {
    if (!this.selected?.id || !this.me?.uid) return;
    this.busy = true;
    try {
      const times = [this.proposed1, this.proposed2, this.proposed3].filter(Boolean);
      await this.svc.requestReschedule(this.selected.id, this.me.uid, this.reason || '(no reason)', times);
      this.close();
    } finally { this.busy = false; }
  }
}