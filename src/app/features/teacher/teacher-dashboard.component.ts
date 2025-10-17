import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-teacher-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <h2>Teacher Dashboard</h2>
    <nav>
      <a routerLink="/teacher/profile">Profile</a> |
      <a routerLink="/teacher/materials">Materials</a> |
      <a routerLink="/teacher/students">Students</a> |
      <a routerLink="/teacher/calendar">Calendar</a>
    </nav>
    <router-outlet></router-outlet>
  `
})
export class TeacherDashboardComponent {}