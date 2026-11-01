import { Routes } from '@angular/router';
import { LoginComponent, SignupComponent } from './auth/auth.components';
import { DashboardComponent, TrainingComponent, HistoryComponent } from './training/training.components';
import { authGuard, guestGuard } from './core/guards';
import { GoalsComponent, HydrationComponent, WeeklyComponent } from './wellness/wellness.components';
export const routes: Routes = [
 {path:'',component:DashboardComponent,canActivate:[authGuard],title:'Dashboard | VitaPulse'},
 {path:'training',component:TrainingComponent,canActivate:[authGuard],title:'Start workout | VitaPulse'},
 {path:'history',component:HistoryComponent,canActivate:[authGuard],title:'Workout history | VitaPulse'},
 {path:'goals',component:GoalsComponent,canActivate:[authGuard],title:'Goals & wellness | VitaPulse'},
 {path:'hydration',component:HydrationComponent,canActivate:[authGuard],title:'Hydration tracker | VitaPulse'},
 {path:'weekly',component:WeeklyComponent,canActivate:[authGuard],title:'Weekly consistency | VitaPulse'},
 {path:'login',component:LoginComponent,canActivate:[guestGuard],title:'Sign in | VitaPulse'},
 {path:'signup',component:SignupComponent,canActivate:[guestGuard],title:'Create account | VitaPulse'},
 {path:'**',redirectTo:''}
];
