import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, Routes } from '@angular/router';
import { importProvidersFrom } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';

import { AppComponent } from './app/app.component';
import { HomePublicComponent } from './app/features/home/home-public.component';
import { SignupComponent } from './app/features/auth/signup.component';
import { LoginComponent } from './app/features/auth/login.component';
import { ProfileComponent } from './app/features/profile/profile.component';
import { TeacherDashboardComponent } from './app/features/teacher/teacher-dashboard.component';
import { StudentDashboardComponent } from './app/features/student/student-dashboard.component';
import { ContactComponent } from './app/features/contact/contact.component';
import { CoursesComponent } from './app/features/courses/courses.component';
import { StudentsComponent } from './app/features/students/students.component';
import { ScheduleComponent } from './app/features/schedule/schedule.component';
import { TeacherStudentsComponent } from './app/features/teacher/teacher-students.component';
import { MaterialsMenuComponent } from './app/features/materials/materials-menu.component';

const routes: Routes = [
  { path: '', component: HomePublicComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'login', component: LoginComponent },
  { path: 'profile', component: ProfileComponent },
  { path: 'teacher', component: TeacherDashboardComponent },
  { path: 'teacher/profile', component: ProfileComponent },
  { path: 'teacher/students', component: TeacherStudentsComponent }, // add tab route
  { path: 'student', component: StudentDashboardComponent },
  { path: 'student/profile', component: ProfileComponent },
  { path: 'courses', component: CoursesComponent },
  { path: 'students', component: StudentsComponent },
  { path: 'schedule', component: ScheduleComponent },
  { path: 'contact', component: ContactComponent },
  { path: 'about', redirectTo: 'contact', pathMatch: 'full' }, // keep old path working (optional)
  { path: 'materials', component: MaterialsMenuComponent },
  { path: 'teacher/materials', component: MaterialsMenuComponent },
  { path: 'student/materials', component: MaterialsMenuComponent },
  { path: '**', redirectTo: '' }
];

bootstrapApplication(AppComponent, {
  providers: [
    importProvidersFrom(HttpClientModule),
    provideRouter(routes)
  ]
}).catch(err => console.error(err));