
import { Injectable } from '@angular/core';

import { BehaviorSubject } from 'rxjs';



@Injectable({ providedIn: 'root' })

export class UserService {

  // currentUser$ emits the currently authenticated user (or null)

  private _currentUser$ = new BehaviorSubject<any>(null);

  currentUser$ = this._currentUser$; // component subscribes directly



  setCurrentUser(user: any) {

    this._currentUser$.next(user);

  }

}

