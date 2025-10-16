import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { CoursesComponent } from './features/courses/courses.component';
import { StudentsComponent } from './features/students/students.component';
import { ScheduleComponent } from './features/schedule/schedule.component';
import { HeaderComponent } from './shared/components/header.component';
import { AuthService } from './core/services/auth.service';
import { AuthGuard } from './core/guards/auth.guard';
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  declarations: [
    AppComponent,
    CoursesComponent,
    StudentsComponent,
    ScheduleComponent,
    HeaderComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule
  ],
  providers: [
    AuthService,
    AuthGuard
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }