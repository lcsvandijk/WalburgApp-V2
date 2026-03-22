import { addDays, getDefaultSchoolDate, getWeekStart } from '../lib/date';
import { SchoolAgendaItem } from '../types/content';
import {
  MagisterActivity,
  MagisterActivityElement,
  MagisterAppointment,
  MagisterGradeResult,
  MagisterSubjectAverage,
  StoredSession,
} from '../types/magister';

function at(date: Date, hours: number, minutes: number) {
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next.toISOString();
}

function buildLesson(
  id: string,
  date: Date,
  startHours: number,
  startMinutes: number,
  endHours: number,
  endMinutes: number,
  subject: string,
  title: string,
  location: string,
  teachers: string,
  lessonHours: string,
): MagisterAppointment {
  return {
    id,
    title,
    subject,
    start: at(date, startHours, startMinutes),
    end: at(date, endHours, endMinutes),
    location,
    teachers,
    lessonHours,
    lessonHour: Number(lessonHours.split('-')[0]),
    lessonHourEnd: Number(lessonHours.split('-').at(-1)),
    description: `${subject} in ${location}`,
    hasAttachments: false,
    infoType: null,
    isAllDay: false,
    isCancelled: false,
    status: null,
    subtype: null,
    type: 1,
  };
}

export function getDemoSession(): StoredSession {
  return {
    id: 999999,
    personId: 999999,
    firstName: 'Demo',
    lastName: 'Leerling',
    fullName: 'Demo Leerling',
    authMode: 'oauth',
    hasApiAccess: true,
    lastSyncedAt: new Date().toISOString(),
  };
}

export function getDemoGrades(): MagisterGradeResult[] {
  return [
    { id: 'demo-grade-1', subject: 'Nederlands', title: 'Leesvaardigheid', grade: '8,4', weight: '2', enteredAt: new Date().toISOString() },
    { id: 'demo-grade-2', subject: 'Engels', title: 'Speaking', grade: '7,8', weight: '1', enteredAt: new Date().toISOString() },
    { id: 'demo-grade-3', subject: 'Wiskunde', title: 'Hoofdstuktoets', grade: '9,1', weight: '3', enteredAt: new Date().toISOString() },
    { id: 'demo-grade-4', subject: 'Biologie', title: 'Practicumverslag', grade: '8,0', weight: '1', enteredAt: new Date().toISOString() },
    { id: 'demo-grade-5', subject: 'Geschiedenis', title: 'SO Republiek', grade: '7,5', weight: '1', enteredAt: new Date().toISOString() },
    { id: 'demo-grade-6', subject: 'Economie', title: 'PW Vraag en aanbod', grade: '8,7', weight: '2', enteredAt: new Date().toISOString() },
    { id: 'demo-grade-7', subject: 'Frans', title: 'Woordjes', grade: '6,9', weight: '1', enteredAt: new Date().toISOString() },
    { id: 'demo-grade-8', subject: 'Aardrijkskunde', title: 'Werkstuk', grade: '8,2', weight: '1', enteredAt: new Date().toISOString() },
  ];
}

export function getDemoSubjectAverages(): MagisterSubjectAverage[] {
  return [
    { id: 'avg-nl', subject: 'Nederlands', average: '8,4', roundedAverage: '8', exactAverage: '8,40', gradeCount: 1 },
    { id: 'avg-en', subject: 'Engels', average: '7,8', roundedAverage: '8', exactAverage: '7,80', gradeCount: 1 },
    { id: 'avg-wi', subject: 'Wiskunde', average: '9,1', roundedAverage: '9', exactAverage: '9,10', gradeCount: 1 },
    { id: 'avg-bi', subject: 'Biologie', average: '8,0', roundedAverage: '8', exactAverage: '8,00', gradeCount: 1 },
    { id: 'avg-ec', subject: 'Economie', average: '8,7', roundedAverage: '9', exactAverage: '8,70', gradeCount: 1 },
  ];
}

export function getDemoAppointments(): MagisterAppointment[] {
  const weekStart = getWeekStart(getDefaultSchoolDate());
  const nextWeekStart = addDays(weekStart, 7);

  return [
    buildLesson('demo-appt-1', weekStart, 8, 30, 9, 20, 'Nederlands', 'Leesvaardigheid', 'B13', 'Mw. K. Bakker', '1'),
    buildLesson('demo-appt-2', weekStart, 9, 30, 10, 20, 'Wiskunde', 'Lineaire functies', 'C02', 'Mw. N. Bos', '2'),
    buildLesson('demo-appt-3', weekStart, 11, 0, 11, 50, 'Engels', 'Presentation skills', 'A18', 'Mw. A. van Bennekum', '3'),
    buildLesson('demo-appt-4', addDays(weekStart, 1), 8, 30, 9, 20, 'Biologie', 'Practicum', 'B24', 'Mw. A. Akyol', '1'),
    buildLesson('demo-appt-5', addDays(weekStart, 1), 9, 30, 10, 20, 'Geschiedenis', 'Republiek', 'A06', 'Mw. S. Baan', '2'),
    buildLesson('demo-appt-6', addDays(weekStart, 1), 13, 10, 14, 0, 'LO', 'Zaaltraining', 'Sporthal', 'Dhr. B. Brakel', '5'),
    buildLesson('demo-appt-7', addDays(weekStart, 2), 10, 40, 11, 30, 'Economie', 'Vraag en aanbod', 'A21', 'Dhr. G. Hagoort', '3'),
    buildLesson('demo-appt-8', addDays(weekStart, 2), 11, 40, 12, 30, 'Frans', 'Grammaire', 'A09', 'Mw. F. Atrari', '4'),
    buildLesson('demo-appt-9', addDays(weekStart, 3), 8, 30, 9, 20, 'Aardrijkskunde', 'Steden en netwerken', 'A03', 'Dhr. M. de Graaf', '1'),
    buildLesson('demo-appt-10', addDays(weekStart, 3), 9, 30, 10, 20, 'Natuurkunde', 'Krachten', 'N2.12', 'Dhr. S. Heijkoop', '2'),
    buildLesson('demo-appt-11', addDays(weekStart, 4), 10, 40, 11, 30, 'Mentoruur', 'Klassengesprek', 'B11', 'Mw. J. Bergman', '3'),
    buildLesson('demo-appt-12', addDays(weekStart, 4), 13, 10, 14, 0, 'Technologie', 'Ontwerpen & onderzoeken', 'T1.05', 'Dhr. Ir. G.A. Brunekreef', '5'),
    buildLesson('demo-appt-13', nextWeekStart, 8, 30, 9, 20, 'Nederlands', 'Boekpresentaties', 'B13', 'Mw. K. Bakker', '1'),
    buildLesson('demo-appt-14', addDays(nextWeekStart, 1), 11, 0, 11, 50, 'Wiskunde', 'Statistiek', 'C02', 'Mw. N. Bos', '3'),
    buildLesson('demo-appt-15', addDays(nextWeekStart, 2), 13, 10, 14, 0, 'Economie', 'Beco-project', 'A21', 'Dhr. G. Hagoort', '5'),
    {
      id: 'demo-appt-16',
      title: 'Open Podium',
      subject: 'Schoolafspraak',
      start: at(addDays(weekStart, 2), 15, 0),
      end: at(addDays(weekStart, 2), 17, 0),
      location: 'Aula',
      teachers: 'Walburg College',
      lessonHours: null,
      lessonHour: null,
      lessonHourEnd: null,
      description: 'Demo-activiteit voor screenshots',
      hasAttachments: false,
      infoType: null,
      isAllDay: false,
      isCancelled: false,
      status: null,
      subtype: null,
      type: 2,
    },
  ] satisfies MagisterAppointment[];
}

export function getDemoAgendaItems(): SchoolAgendaItem[] {
  const base = getWeekStart(getDefaultSchoolDate());

  return Array.from({ length: 14 }, (_, index) => {
    const date = addDays(base, index);
    const isAllDay = index % 3 === 0;

    return {
      id: `demo-agenda-${index + 1}`,
      title:
        index % 4 === 0
          ? 'Open atelier'
          : index % 4 === 1
            ? 'Demofotografie voor socials'
            : index % 4 === 2
              ? 'Studieplein extra open'
              : 'Klasactiviteit & mentorcheck',
      start: isAllDay ? at(date, 0, 0) : at(date, 14, 30),
      end: isAllDay ? at(addDays(date, 1), 0, 0) : at(date, 16, 0),
      isAllDay,
      description:
        index % 2 === 0
          ? 'Demo-item zodat de agenda op screenshots altijd gevuld is.'
          : 'Voorbeelditem voor de schoolagenda in demo mode.',
      url: 'https://walburgcollege.nl/agenda/',
    };
  });
}

export function getDemoActivities(): MagisterActivity[] {
  const today = getDefaultSchoolDate();

  return [
    {
      id: 'demo-activity-1',
      activityId: 501,
      title: 'Workshops cultuurdag',
      details: 'Kies een workshop voor de cultuurdag op Walburg.',
      visibleFrom: at(addDays(today, -3), 8, 0),
      visibleTo: at(addDays(today, 7), 23, 0),
      subscriptionStart: at(addDays(today, -2), 8, 0),
      subscriptionEnd: at(addDays(today, 3), 23, 0),
      maximumRegistrations: 1,
      minimumRegistrations: 1,
      status: 1,
      accessType: 0,
      subscriptionCount: 0,
      links: [],
      selfLink: null,
    },
    {
      id: 'demo-activity-2',
      activityId: 502,
      title: 'Sporttoernooi keuzes',
      details: 'Schrijf je in voor een teamonderdeel tijdens het toernooi.',
      visibleFrom: at(addDays(today, -1), 8, 0),
      visibleTo: at(addDays(today, 10), 23, 0),
      subscriptionStart: at(addDays(today, -1), 8, 0),
      subscriptionEnd: at(addDays(today, 5), 20, 0),
      maximumRegistrations: 2,
      minimumRegistrations: 1,
      status: 1,
      accessType: 0,
      subscriptionCount: 1,
      links: [],
      selfLink: null,
    },
    {
      id: 'demo-activity-3',
      activityId: 503,
      title: 'Profielmiddag bovenbouw',
      details: 'Kies een informatiesessie die past bij je profiel.',
      visibleFrom: at(today, 8, 0),
      visibleTo: at(addDays(today, 12), 23, 0),
      subscriptionStart: at(today, 8, 0),
      subscriptionEnd: at(addDays(today, 6), 17, 0),
      maximumRegistrations: 1,
      minimumRegistrations: 1,
      status: 1,
      accessType: 0,
      subscriptionCount: 0,
      links: [],
      selfLink: null,
    },
  ];
}

export function getDemoActivityElements(activityId: number): MagisterActivityElement[] {
  const today = getDefaultSchoolDate();

  const collections: Record<number, MagisterActivityElement[]> = {
    501: [
      {
        id: 'demo-el-501-1',
        elementId: 9001,
        activityId,
        title: 'Fotografie',
        topic: 'Fotografie in de studio',
        details: 'Werk met licht, compositie en snelle portretopstellingen.',
        subjectCode: 'CKV',
        teacherCode: 'VISR',
        room: 'Aula Studio',
        variantCode: 'A',
        subscriptionStart: at(addDays(today, -2), 8, 0),
        subscriptionEnd: at(addDays(today, 3), 23, 0),
        maxParticipants: 18,
        minParticipants: 8,
        colorIndex: 1,
        isSubscribed: false,
        isMandatory: false,
        availableSeats: 6,
        canSubscribe: true,
        links: [],
        subscriptionLink: 'demo://subscribe/9001',
        selfLink: null,
      },
      {
        id: 'demo-el-501-2',
        elementId: 9002,
        activityId,
        title: 'Podium',
        topic: 'Podiumkunsten & performance',
        details: 'Voor leerlingen die graag op het podium staan.',
        subjectCode: 'POD',
        teacherCode: 'TATC',
        room: 'Theaterzaal',
        variantCode: 'B',
        subscriptionStart: at(addDays(today, -2), 8, 0),
        subscriptionEnd: at(addDays(today, 3), 23, 0),
        maxParticipants: 20,
        minParticipants: 10,
        colorIndex: 2,
        isSubscribed: true,
        isMandatory: false,
        availableSeats: 3,
        canSubscribe: true,
        links: [],
        subscriptionLink: 'demo://subscribe/9002',
        selfLink: null,
      },
    ],
    502: [
      {
        id: 'demo-el-502-1',
        elementId: 9011,
        activityId,
        title: 'Volleybal',
        topic: 'Volleybalteam',
        details: 'Teaminschrijving voor het volleybaltoernooi.',
        subjectCode: 'LO',
        teacherCode: 'BRAB',
        room: 'Sporthal',
        variantCode: 'Team A',
        subscriptionStart: at(addDays(today, -1), 8, 0),
        subscriptionEnd: at(addDays(today, 5), 20, 0),
        maxParticipants: 12,
        minParticipants: 8,
        colorIndex: 3,
        isSubscribed: false,
        isMandatory: false,
        availableSeats: 5,
        canSubscribe: true,
        links: [],
        subscriptionLink: 'demo://subscribe/9011',
        selfLink: null,
      },
      {
        id: 'demo-el-502-2',
        elementId: 9012,
        activityId,
        title: 'Basketbal',
        topic: 'Basketbalteam',
        details: 'Snel, fanatiek en ideaal voor screenshots.',
        subjectCode: 'LO',
        teacherCode: 'NUIY',
        room: 'Sporthal',
        variantCode: 'Team B',
        subscriptionStart: at(addDays(today, -1), 8, 0),
        subscriptionEnd: at(addDays(today, 5), 20, 0),
        maxParticipants: 10,
        minParticipants: 8,
        colorIndex: 4,
        isSubscribed: false,
        isMandatory: false,
        availableSeats: 2,
        canSubscribe: true,
        links: [],
        subscriptionLink: 'demo://subscribe/9012',
        selfLink: null,
      },
    ],
    503: [
      {
        id: 'demo-el-503-1',
        elementId: 9021,
        activityId,
        title: 'Economie & ondernemen',
        topic: 'Profielsessie economie',
        details: 'Voor leerlingen die meer willen weten over economie en beco.',
        subjectCode: 'EC',
        teacherCode: 'HAGG',
        room: 'A21',
        variantCode: 'Sessie 1',
        subscriptionStart: at(today, 8, 0),
        subscriptionEnd: at(addDays(today, 6), 17, 0),
        maxParticipants: 30,
        minParticipants: 8,
        colorIndex: 5,
        isSubscribed: false,
        isMandatory: false,
        availableSeats: 11,
        canSubscribe: true,
        links: [],
        subscriptionLink: 'demo://subscribe/9021',
        selfLink: null,
      },
      {
        id: 'demo-el-503-2',
        elementId: 9022,
        activityId,
        title: 'Technasium',
        topic: 'O&O en technasium',
        details: 'Ontdek projecten, labs en samenwerken met opdrachtgevers.',
        subjectCode: 'O&O',
        teacherCode: 'BREG',
        room: 'T1.05',
        variantCode: 'Sessie 2',
        subscriptionStart: at(today, 8, 0),
        subscriptionEnd: at(addDays(today, 6), 17, 0),
        maxParticipants: 24,
        minParticipants: 8,
        colorIndex: 6,
        isSubscribed: false,
        isMandatory: false,
        availableSeats: 9,
        canSubscribe: true,
        links: [],
        subscriptionLink: 'demo://subscribe/9022',
        selfLink: null,
      },
    ],
  };

  return collections[activityId] ?? [];
}
