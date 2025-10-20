import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TeacherNotificationsComponent } from './teacher-notifications.component';

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, TeacherNotificationsComponent],
  template: `
    <h2>Teacher Dashboard</h2>

    <app-teacher-notifications></app-teacher-notifications>

    <router-outlet></router-outlet>
  `
})
export class TeacherDashboardComponent {}