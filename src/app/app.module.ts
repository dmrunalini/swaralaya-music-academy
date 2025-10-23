import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { TeacherStudentsComponent } from './features/teacher/teacher-students.component';

@NgModule({
  declarations: [],
  imports: [
    BrowserModule,
    FormsModule, // keep if other templates use ngModel; not required for the standalone component itself
    TeacherStudentsComponent // import standalone component here
  ],
  providers: []
})
export class AppModule {}