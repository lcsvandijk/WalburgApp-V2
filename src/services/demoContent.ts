import {
  getDemoActivityElements,
  getDemoActivities,
  getDemoAgendaItems,
} from '../data/demoContent';

export async function loadDemoSchoolAgenda() {
  return getDemoAgendaItems();
}

export async function loadDemoActivities() {
  return getDemoActivities();
}

export async function loadDemoActivityElements(activityId: number) {
  return getDemoActivityElements(activityId);
}
