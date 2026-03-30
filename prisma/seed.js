/* eslint-disable camelcase */
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'Wesal@1234';
const BCRYPT_ROUNDS = 10;

const usersSeed = [
  {
    key: 'majd',
    firstName: 'majd',
    lastName: 'awwad',
    email: 'majd.seed@wesal.app',
    legacyEmail: 'majd.seed@wesal.local',
    role: 'admin',
  },
  {
    key: 'israa',
    firstName: 'israa',
    lastName: 'hashash',
    email: 'israa.seed@wesal.app',
    legacyEmail: 'israa.seed@wesal.local',
    role: 'admin',
  },
  {
    key: 'aseel',
    firstName: 'aseel',
    lastName: 'dwikat',
    email: 'aseel.seed@wesal.app',
    legacyEmail: 'aseel.seed@wesal.local',
    role: 'admin',
  },
  {
    key: 'rama',
    firstName: 'rama',
    lastName: 'asayra',
    email: 'rama.seed@wesal.app',
    legacyEmail: 'rama.seed@wesal.local',
    role: 'admin',
  },
  {
    key: 'ahmad_mod',
    firstName: 'ahmad',
    lastName: 'barghouti',
    email: 'ahmad.mod@wesal.app',
    legacyEmail: 'ahmad.mod@wesal.local',
    role: 'moderator',
  },
  {
    key: 'dina_mod',
    firstName: 'dina',
    lastName: 'saleh',
    email: 'dina.mod@wesal.app',
    legacyEmail: 'dina.mod@wesal.local',
    role: 'moderator',
  },
  {
    key: 'omar_mod',
    firstName: 'omar',
    lastName: 'sabbah',
    email: 'omar.mod@wesal.app',
    legacyEmail: 'omar.mod@wesal.local',
    role: 'moderator',
  },
  {
    key: 'layan_user',
    firstName: 'layan',
    lastName: 'khalil',
    email: 'layan.user@wesal.app',
    legacyEmail: 'layan.user@wesal.local',
    role: 'user',
  },
  {
    key: 'yousef_user',
    firstName: 'yousef',
    lastName: 'tamimi',
    email: 'yousef.user@wesal.app',
    legacyEmail: 'yousef.user@wesal.local',
    role: 'user',
  },
  {
    key: 'mira_user',
    firstName: 'mira',
    lastName: 'qudsi',
    email: 'mira.user@wesal.app',
    legacyEmail: 'mira.user@wesal.local',
    role: 'user',
  },
];

const checkpointsSeed = [
  {
    key: 'nablus_south_corridor',
    name: 'Nablus South Corridor Gate',
    city: 'Nablus',
    area: 'Southern Bypass',
    road: 'Route N-05',
    description: 'Fictionalized checkpoint inspired by movement-control corridors near Nablus.',
    latitude: '32.205520',
    longitude: '35.264970',
    status: 'open',
    createdByKey: 'majd',
  },
  {
    key: 'ramallah_north_link',
    name: 'Ramallah North Link Crossing',
    city: 'Ramallah',
    area: 'North Link',
    road: 'Route R-12',
    description: 'Fictionalized crossing inspired by roads connecting Ramallah outskirts.',
    latitude: '31.932240',
    longitude: '35.205460',
    status: 'slow',
    createdByKey: 'israa',
  },
  {
    key: 'bethlehem_west_pass',
    name: 'Bethlehem West Pass Point',
    city: 'Bethlehem',
    area: 'Western Access',
    road: 'Route B-03',
    description: 'Fictionalized checkpoint inspired by Bethlehem perimeter access controls.',
    latitude: '31.705400',
    longitude: '35.180200',
    status: 'closed',
    createdByKey: 'aseel',
  },
  {
    key: 'hebron_hills_junction',
    name: 'Hebron Hills Junction Gate',
    city: 'Hebron',
    area: 'Hill Roads',
    road: 'Route H-21',
    description: 'Fictionalized checkpoint for mountain junction near Hebron.',
    latitude: '31.534900',
    longitude: '35.099100',
    status: 'unknown',
    createdByKey: 'rama',
  },
  {
    key: 'jenin_east_arc',
    name: 'Jenin East Arc Crossing',
    city: 'Jenin',
    area: 'Eastern Arc',
    road: 'Route J-08',
    description: 'Fictionalized checkpoint around Jenin agricultural belt roads.',
    latitude: '32.465200',
    longitude: '35.297600',
    status: 'open',
    createdByKey: 'ahmad_mod',
  },
  {
    key: 'tulkarm_coastal_link',
    name: 'Tulkarm Coastal Link Gate',
    city: 'Tulkarm',
    area: 'Western Link',
    road: 'Route T-14',
    description: 'Fictionalized checkpoint inspired by Tulkarm connector roads.',
    latitude: '32.308900',
    longitude: '35.020900',
    status: 'slow',
    createdByKey: 'dina_mod',
  },
  {
    key: 'qalqilya_orchard_crossing',
    name: 'Qalqilya Orchard Crossing',
    city: 'Qalqilya',
    area: 'Orchard Belt',
    road: 'Route Q-02',
    description: 'Fictionalized checkpoint for orchard-side movement in Qalqilya zone.',
    latitude: '32.189500',
    longitude: '34.972700',
    status: 'open',
    createdByKey: 'omar_mod',
  },
  {
    key: 'jericho_valley_gate',
    name: 'Jericho Valley Transit Gate',
    city: 'Jericho',
    area: 'Valley Corridor',
    road: 'Route JER-09',
    description: 'Fictionalized checkpoint inspired by valley transit controls near Jericho.',
    latitude: '31.866900',
    longitude: '35.450600',
    status: 'unknown',
    createdByKey: 'majd',
  },
];

const incidentsSeed = [
  {
    key: 'inc_closure_nablus',
    type: 'closure',
    severity: 'high',
    status: 'verified',
    trafficStatus: 'closed',
    description: '[SEED] Temporary full closure reported on Nablus South Corridor Gate.',
    city: 'Nablus',
    area: 'Southern Bypass',
    road: 'Route N-05',
    latitude: '32.206120',
    longitude: '35.265320',
    reporterKey: 'yousef_user',
    moderatorKey: 'ahmad_mod',
    checkpointKey: 'nablus_south_corridor',
  },
  {
    key: 'inc_delay_ramallah',
    type: 'delay',
    severity: 'medium',
    status: 'verified',
    trafficStatus: 'slow',
    description: '[SEED] Heavy queue and delay at Ramallah North Link Crossing.',
    city: 'Ramallah',
    area: 'North Link',
    road: 'Route R-12',
    latitude: '31.932820',
    longitude: '35.205820',
    reporterKey: 'mira_user',
    moderatorKey: 'dina_mod',
    checkpointKey: 'ramallah_north_link',
  },
  {
    key: 'inc_accident_tulkarm',
    type: 'accident',
    severity: 'critical',
    status: 'pending',
    trafficStatus: 'slow',
    description: '[SEED] Multi-vehicle collision near Tulkarm Coastal Link Gate.',
    city: 'Tulkarm',
    area: 'Western Link',
    road: 'Route T-14',
    latitude: '32.309100',
    longitude: '35.021800',
    reporterKey: 'layan_user',
    checkpointKey: 'tulkarm_coastal_link',
  },
  {
    key: 'inc_military_hebron',
    type: 'military_activity',
    severity: 'high',
    status: 'pending',
    trafficStatus: 'unknown',
    description:
      '[SEED] Intermittent military activity reported around Hebron Hills Junction Gate.',
    city: 'Hebron',
    area: 'Hill Roads',
    road: 'Route H-21',
    latitude: '31.535700',
    longitude: '35.099900',
    reporterKey: 'yousef_user',
    checkpointKey: 'hebron_hills_junction',
  },
  {
    key: 'inc_weather_jericho',
    type: 'weather_hazard',
    severity: 'medium',
    status: 'closed',
    trafficStatus: 'open',
    description: '[SEED] Earlier dust storm hazard near Jericho Valley Transit Gate, now cleared.',
    city: 'Jericho',
    area: 'Valley Corridor',
    road: 'Route JER-09',
    latitude: '31.867400',
    longitude: '35.451200',
    reporterKey: 'mira_user',
    moderatorKey: 'rama',
    checkpointKey: 'jericho_valley_gate',
  },
  {
    key: 'inc_road_damage_bethlehem',
    type: 'road_damage',
    severity: 'high',
    status: 'verified',
    trafficStatus: 'slow',
    description: '[SEED] Pothole and surface failure reported near Bethlehem West Pass Point.',
    city: 'Bethlehem',
    area: 'Western Access',
    road: 'Route B-03',
    latitude: '31.705900',
    longitude: '35.180900',
    reporterKey: 'layan_user',
    moderatorKey: 'israa',
    checkpointKey: 'bethlehem_west_pass',
  },
  {
    key: 'inc_protest_jenin',
    type: 'protest',
    severity: 'medium',
    status: 'rejected',
    trafficStatus: 'unknown',
    description: '[SEED] Protest activity near Jenin East Arc Crossing (report not confirmed).',
    city: 'Jenin',
    area: 'Eastern Arc',
    road: 'Route J-08',
    latitude: '32.466100',
    longitude: '35.297000',
    reporterKey: 'yousef_user',
    moderatorKey: 'aseel',
    checkpointKey: 'jenin_east_arc',
  },
  {
    key: 'inc_construction_qalqilya',
    type: 'construction',
    severity: 'low',
    status: 'verified',
    trafficStatus: 'slow',
    description: '[SEED] Road shoulder maintenance causing intermittent lane closure in Qalqilya.',
    city: 'Qalqilya',
    area: 'Orchard Belt',
    road: 'Route Q-02',
    latitude: '32.190200',
    longitude: '34.973300',
    reporterKey: 'mira_user',
    moderatorKey: 'ahmad_mod',
    checkpointKey: 'qalqilya_orchard_crossing',
  },
  {
    key: 'inc_checkpoint_update_ramallah',
    type: 'checkpoint_status_update',
    severity: 'low',
    status: 'verified',
    trafficStatus: 'open',
    description: '[SEED] Gate reopened at Ramallah North Link Crossing after inspection.',
    city: 'Ramallah',
    area: 'North Link',
    road: 'Route R-12',
    latitude: '31.932100',
    longitude: '35.205100',
    reporterKey: 'majd',
    moderatorKey: 'dina_mod',
    checkpointKey: 'ramallah_north_link',
  },
  {
    key: 'inc_other_nablus',
    type: 'other',
    severity: 'low',
    status: 'closed',
    trafficStatus: 'open',
    description: '[SEED] Temporary inspection operation in Nablus area completed.',
    city: 'Nablus',
    area: 'Southern Bypass',
    road: 'Route N-05',
    latitude: '32.205890',
    longitude: '35.265510',
    reporterKey: 'majd',
    moderatorKey: 'rama',
    checkpointKey: 'nablus_south_corridor',
  },
];

const reportsSeed = [
  {
    key: 'rep_verified_closure',
    userKey: 'yousef_user',
    incidentKey: 'inc_closure_nablus',
    checkpointKey: 'nablus_south_corridor',
    type: 'closure',
    severity: 'high',
    status: 'verified',
    description: '[SEED] Verified user report: full closure and turnback at Nablus south gate.',
    city: 'Nablus',
    area: 'Southern Bypass',
    road: 'Route N-05',
    locationLat: '32.206120',
    locationLng: '35.265320',
    proposedCheckpointStatus: 'closed',
    moderatedByKey: 'ahmad_mod',
  },
  {
    key: 'rep_verified_delay',
    userKey: 'mira_user',
    incidentKey: 'inc_delay_ramallah',
    checkpointKey: 'ramallah_north_link',
    type: 'delay',
    severity: 'medium',
    status: 'verified',
    description: '[SEED] Verified user report: 35-minute queue at Ramallah north link.',
    city: 'Ramallah',
    area: 'North Link',
    road: 'Route R-12',
    locationLat: '31.932820',
    locationLng: '35.205820',
    proposedCheckpointStatus: 'slow',
    moderatedByKey: 'dina_mod',
  },
  {
    key: 'rep_pending_accident',
    userKey: 'layan_user',
    incidentKey: 'inc_accident_tulkarm',
    checkpointKey: 'tulkarm_coastal_link',
    type: 'accident',
    severity: 'critical',
    status: 'pending',
    description: '[SEED] Pending user report: collision still blocking one lane near Tulkarm.',
    city: 'Tulkarm',
    area: 'Western Link',
    road: 'Route T-14',
    locationLat: '32.309100',
    locationLng: '35.021800',
    proposedCheckpointStatus: 'slow',
  },
  {
    key: 'rep_pending_military',
    userKey: 'yousef_user',
    incidentKey: 'inc_military_hebron',
    checkpointKey: 'hebron_hills_junction',
    type: 'military_activity',
    severity: 'high',
    status: 'pending',
    description: '[SEED] Pending report: temporary halt due to military patrol movement.',
    city: 'Hebron',
    area: 'Hill Roads',
    road: 'Route H-21',
    locationLat: '31.535700',
    locationLng: '35.099900',
    proposedCheckpointStatus: 'unknown',
  },
  {
    key: 'rep_verified_road_damage',
    userKey: 'layan_user',
    incidentKey: 'inc_road_damage_bethlehem',
    checkpointKey: 'bethlehem_west_pass',
    type: 'road_damage',
    severity: 'high',
    status: 'verified',
    description: '[SEED] Verified report: severe asphalt damage requires slower passage.',
    city: 'Bethlehem',
    area: 'Western Access',
    road: 'Route B-03',
    locationLat: '31.705900',
    locationLng: '35.180900',
    proposedCheckpointStatus: 'slow',
    moderatedByKey: 'israa',
  },
  {
    key: 'rep_rejected_protest',
    userKey: 'mira_user',
    incidentKey: 'inc_protest_jenin',
    checkpointKey: 'jenin_east_arc',
    type: 'protest',
    severity: 'medium',
    status: 'rejected',
    description: '[SEED] Rejected report: protest claim could not be corroborated by moderators.',
    city: 'Jenin',
    area: 'Eastern Arc',
    road: 'Route J-08',
    locationLat: '32.466100',
    locationLng: '35.297000',
    proposedCheckpointStatus: 'unknown',
    moderatedByKey: 'aseel',
  },
  {
    key: 'rep_verified_checkpoint_update',
    userKey: 'majd',
    incidentKey: 'inc_checkpoint_update_ramallah',
    checkpointKey: 'ramallah_north_link',
    type: 'checkpoint_status_update',
    severity: 'low',
    status: 'verified',
    description: '[SEED] Verified report: Ramallah north gate reopened and flow normalized.',
    city: 'Ramallah',
    area: 'North Link',
    road: 'Route R-12',
    locationLat: '31.932100',
    locationLng: '35.205100',
    proposedCheckpointStatus: 'open',
    moderatedByKey: 'dina_mod',
  },
  {
    key: 'rep_closed_weather',
    userKey: 'mira_user',
    incidentKey: 'inc_weather_jericho',
    checkpointKey: 'jericho_valley_gate',
    type: 'weather_hazard',
    severity: 'medium',
    status: 'verified',
    description: '[SEED] Verified report: dust hazard ended and route reopened in Jericho valley.',
    city: 'Jericho',
    area: 'Valley Corridor',
    road: 'Route JER-09',
    locationLat: '31.867400',
    locationLng: '35.451200',
    proposedCheckpointStatus: 'open',
    moderatedByKey: 'rama',
  },
  {
    key: 'rep_verified_construction',
    userKey: 'yousef_user',
    incidentKey: 'inc_construction_qalqilya',
    checkpointKey: 'qalqilya_orchard_crossing',
    type: 'construction',
    severity: 'low',
    status: 'verified',
    description: '[SEED] Verified report: shoulder maintenance ongoing with partial lane access.',
    city: 'Qalqilya',
    area: 'Orchard Belt',
    road: 'Route Q-02',
    locationLat: '32.190200',
    locationLng: '34.973300',
    proposedCheckpointStatus: 'slow',
    moderatedByKey: 'ahmad_mod',
  },
  {
    key: 'rep_closed_other',
    userKey: 'majd',
    incidentKey: 'inc_other_nablus',
    checkpointKey: 'nablus_south_corridor',
    type: 'other',
    severity: 'low',
    status: 'verified',
    description: '[SEED] Verified report: short-term inspection resolved in Nablus corridor.',
    city: 'Nablus',
    area: 'Southern Bypass',
    road: 'Route N-05',
    locationLat: '32.205890',
    locationLng: '35.265510',
    proposedCheckpointStatus: 'open',
    moderatedByKey: 'rama',
  },
  {
    key: 'rep_checkpoint_manual_closed',
    userKey: 'aseel',
    checkpointKey: 'bethlehem_west_pass',
    type: 'checkpoint_status_update',
    severity: 'high',
    status: 'verified',
    description: '[SEED] Verified admin report: Bethlehem pass remains closed for maintenance.',
    city: 'Bethlehem',
    area: 'Western Access',
    road: 'Route B-03',
    locationLat: '31.705400',
    locationLng: '35.180200',
    proposedCheckpointStatus: 'closed',
    moderatedByKey: 'israa',
  },
  {
    key: 'rep_misc_pending',
    userKey: 'rama',
    checkpointKey: 'hebron_hills_junction',
    type: 'other',
    severity: 'low',
    status: 'pending',
    description: '[SEED] Pending report: manual checkpoint verification requested in Hebron hills.',
    city: 'Hebron',
    area: 'Hill Roads',
    road: 'Route H-21',
    locationLat: '31.534900',
    locationLng: '35.099100',
    proposedCheckpointStatus: 'unknown',
  },
];

const reportVotesSeed = [
  { reportKey: 'rep_verified_closure', userKey: 'majd', vote: 'up' },
  { reportKey: 'rep_verified_closure', userKey: 'israa', vote: 'up' },
  { reportKey: 'rep_verified_delay', userKey: 'aseel', vote: 'up' },
  { reportKey: 'rep_verified_delay', userKey: 'rama', vote: 'up' },
  { reportKey: 'rep_pending_accident', userKey: 'ahmad_mod', vote: 'up' },
  { reportKey: 'rep_pending_military', userKey: 'dina_mod', vote: 'up' },
  { reportKey: 'rep_rejected_protest', userKey: 'omar_mod', vote: 'down' },
  { reportKey: 'rep_rejected_protest', userKey: 'majd', vote: 'down' },
  { reportKey: 'rep_verified_construction', userKey: 'yousef_user', vote: 'up' },
  { reportKey: 'rep_closed_weather', userKey: 'mira_user', vote: 'up' },
];

const moderationAuditSeed = [
  {
    reportKey: 'rep_verified_closure',
    moderatorKey: 'ahmad_mod',
    action: 'approved',
    reason: '[SEED] Cross-checked with multiple reports and checkpoint telemetry.',
  },
  {
    reportKey: 'rep_verified_delay',
    moderatorKey: 'dina_mod',
    action: 'approved',
    reason: '[SEED] Queue duration confirmed by two independent users.',
  },
  {
    reportKey: 'rep_rejected_protest',
    moderatorKey: 'aseel',
    action: 'rejected',
    reason: '[SEED] No corroborating field indicators in review window.',
  },
  {
    reportKey: 'rep_verified_road_damage',
    moderatorKey: 'israa',
    action: 'approved',
    reason: '[SEED] Road condition matched recent maintenance alerts.',
  },
  {
    reportKey: 'rep_closed_weather',
    moderatorKey: 'rama',
    action: 'approved',
    reason: '[SEED] Hazard expired and travel resumed normally.',
  },
  {
    reportKey: 'rep_verified_construction',
    moderatorKey: 'ahmad_mod',
    action: 'approved',
    reason: '[SEED] Construction team notice and user photos aligned.',
  },
];

const subscriptionsSeed = [
  {
    key: 'sub_majd_ramallah',
    userKey: 'majd',
    areaLat: '31.932240',
    areaLng: '35.205460',
    radiusKm: '12.00',
    category: 'all',
    isActive: true,
  },
  {
    key: 'sub_majd_nablus',
    userKey: 'majd',
    areaLat: '32.205520',
    areaLng: '35.264970',
    radiusKm: '15.00',
    category: 'checkpoint',
    isActive: true,
  },
  {
    key: 'sub_israa_bethlehem',
    userKey: 'israa',
    areaLat: '31.705400',
    areaLng: '35.180200',
    radiusKm: '10.00',
    category: 'road',
    isActive: true,
  },
  {
    key: 'sub_layan_tulkarm',
    userKey: 'layan_user',
    areaLat: '32.308900',
    areaLng: '35.020900',
    radiusKm: '8.00',
    category: 'incident',
    isActive: true,
  },
  {
    key: 'sub_yousef_jenin',
    userKey: 'yousef_user',
    areaLat: '32.465200',
    areaLng: '35.297600',
    radiusKm: '9.00',
    category: 'all',
    isActive: true,
  },
];

const alertsSeed = [
  {
    incidentKey: 'inc_closure_nablus',
    subscriptionKey: 'sub_majd_nablus',
    status: 'sent',
  },
  {
    incidentKey: 'inc_delay_ramallah',
    subscriptionKey: 'sub_majd_ramallah',
    status: 'sent',
  },
  {
    incidentKey: 'inc_road_damage_bethlehem',
    subscriptionKey: 'sub_israa_bethlehem',
    status: 'sent',
  },
  {
    incidentKey: 'inc_accident_tulkarm',
    subscriptionKey: 'sub_layan_tulkarm',
    status: 'pending',
  },
];

const routeHistorySeed = [
  {
    userKey: 'majd',
    fromLat: '31.932240',
    fromLng: '35.205460',
    toLat: '32.205520',
    toLng: '35.264970',
    distanceKm: '56.40',
    baseDurationMinutes: '64.00',
    finalDurationMinutes: '81.00',
    totalDelayMinutes: 17,
    isFallback: false,
  },
  {
    userKey: 'israa',
    fromLat: '31.705400',
    fromLng: '35.180200',
    toLat: '31.932240',
    toLng: '35.205460',
    distanceKm: '31.20',
    baseDurationMinutes: '44.00',
    finalDurationMinutes: '57.00',
    totalDelayMinutes: 13,
    isFallback: false,
  },
  {
    userKey: 'yousef_user',
    fromLat: '32.465200',
    fromLng: '35.297600',
    toLat: '32.308900',
    toLng: '35.020900',
    distanceKm: '37.90',
    baseDurationMinutes: '49.00',
    finalDurationMinutes: '68.00',
    totalDelayMinutes: 19,
    isFallback: true,
  },
  {
    userKey: 'rama',
    fromLat: '31.534900',
    fromLng: '35.099100',
    toLat: '31.705400',
    toLng: '35.180200',
    distanceKm: '22.80',
    baseDurationMinutes: '32.00',
    finalDurationMinutes: '39.00',
    totalDelayMinutes: 7,
    isFallback: false,
  },
];

async function seedUsers() {
  const usersByKey = {};
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

  for (const user of usersSeed) {
    if (!user.legacyEmail) {
      continue;
    }

    const [legacyUser, currentUser] = await Promise.all([
      prisma.user.findUnique({ where: { email: user.legacyEmail } }),
      prisma.user.findUnique({ where: { email: user.email } }),
    ]);

    if (legacyUser && !currentUser) {
      await prisma.user.update({
        where: { id: legacyUser.id },
        data: { email: user.email },
      });
    }
  }

  for (const user of usersSeed) {
    const createdUser = await prisma.user.upsert({
      where: { email: user.email },
      update: {
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        passwordHash,
      },
      create: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        passwordHash,
      },
    });

    usersByKey[user.key] = createdUser;
  }

  return usersByKey;
}

async function seedCheckpoints(usersByKey) {
  const checkpointsByKey = {};

  for (const checkpoint of checkpointsSeed) {
    const existing = await prisma.checkpoint.findFirst({
      where: {
        name: checkpoint.name,
        city: checkpoint.city,
      },
    });

    const payload = {
      name: checkpoint.name,
      city: checkpoint.city,
      area: checkpoint.area,
      road: checkpoint.road,
      description: checkpoint.description,
      latitude: checkpoint.latitude,
      longitude: checkpoint.longitude,
      status: checkpoint.status,
      createdBy: usersByKey[checkpoint.createdByKey].id,
    };

    const checkpointRecord = existing
      ? await prisma.checkpoint.update({
          where: { id: existing.id },
          data: payload,
        })
      : await prisma.checkpoint.create({ data: payload });

    checkpointsByKey[checkpoint.key] = checkpointRecord;
  }

  return checkpointsByKey;
}

async function seedIncidents(usersByKey, checkpointsByKey) {
  const incidentsByKey = {};

  for (const incident of incidentsSeed) {
    const existing = await prisma.incident.findFirst({
      where: { description: incident.description },
    });

    const payload = {
      type: incident.type,
      severity: incident.severity,
      status: incident.status,
      trafficStatus: incident.trafficStatus,
      description: incident.description,
      city: incident.city,
      area: incident.area,
      road: incident.road,
      locationLat: incident.latitude,
      locationLng: incident.longitude,
      reportedBy: usersByKey[incident.reporterKey].id,
      moderatedBy: incident.moderatorKey ? usersByKey[incident.moderatorKey].id : null,
      moderatedAt: incident.moderatorKey ? new Date() : null,
      resolvedAt: incident.status === 'closed' ? new Date() : null,
      checkpointId: incident.checkpointKey ? checkpointsByKey[incident.checkpointKey].id : null,
    };

    const incidentRecord = existing
      ? await prisma.incident.update({
          where: { id: existing.id },
          data: payload,
        })
      : await prisma.incident.create({ data: payload });

    incidentsByKey[incident.key] = incidentRecord;
  }

  return incidentsByKey;
}

async function seedReports(usersByKey, checkpointsByKey, incidentsByKey) {
  const reportsByKey = {};

  for (const report of reportsSeed) {
    const existing = await prisma.report.findFirst({
      where: { description: report.description },
    });

    const payload = {
      userId: usersByKey[report.userKey].id,
      incidentId: report.incidentKey ? incidentsByKey[report.incidentKey].id : null,
      checkpointId: report.checkpointKey ? checkpointsByKey[report.checkpointKey].id : null,
      type: report.type,
      severity: report.severity,
      status: report.status,
      description: report.description,
      city: report.city,
      area: report.area,
      road: report.road,
      locationLat: report.locationLat,
      locationLng: report.locationLng,
      proposedCheckpointStatus: report.proposedCheckpointStatus || null,
      moderatedBy: report.moderatedByKey ? usersByKey[report.moderatedByKey].id : null,
      moderatedAt: report.moderatedByKey ? new Date() : null,
      rejectReason:
        report.status === 'rejected' ? '[SEED] Report rejected after moderation review.' : null,
    };

    const reportRecord = existing
      ? await prisma.report.update({
          where: { id: existing.id },
          data: payload,
        })
      : await prisma.report.create({ data: payload });

    reportsByKey[report.key] = reportRecord;
  }

  return reportsByKey;
}

async function seedReportVotes(usersByKey, reportsByKey) {
  for (const vote of reportVotesSeed) {
    await prisma.reportVote.upsert({
      where: {
        reportId_userId: {
          reportId: reportsByKey[vote.reportKey].id,
          userId: usersByKey[vote.userKey].id,
        },
      },
      update: { vote: vote.vote },
      create: {
        reportId: reportsByKey[vote.reportKey].id,
        userId: usersByKey[vote.userKey].id,
        vote: vote.vote,
      },
    });
  }
}

async function seedModerationAudit(usersByKey, reportsByKey) {
  for (const log of moderationAuditSeed) {
    const reportId = reportsByKey[log.reportKey].id;
    const moderatorId = usersByKey[log.moderatorKey].id;

    const existing = await prisma.moderationAuditLog.findFirst({
      where: {
        reportId,
        moderatorId,
        reason: log.reason,
      },
    });

    if (!existing) {
      await prisma.moderationAuditLog.create({
        data: {
          reportId,
          moderatorId,
          action: log.action,
          reason: log.reason,
        },
      });
    }
  }
}

async function seedSubscriptions(usersByKey) {
  const subscriptionsByKey = {};

  for (const subscription of subscriptionsSeed) {
    const userId = usersByKey[subscription.userKey].id;

    const existing = await prisma.alertSubscription.findFirst({
      where: {
        userId,
        category: subscription.category,
      },
    });

    const payload = {
      userId,
      areaLat: subscription.areaLat,
      areaLng: subscription.areaLng,
      radiusKm: subscription.radiusKm,
      category: subscription.category,
      isActive: subscription.isActive,
    };

    const subscriptionRecord = existing
      ? await prisma.alertSubscription.update({
          where: { id: existing.id },
          data: payload,
        })
      : await prisma.alertSubscription.create({ data: payload });

    subscriptionsByKey[subscription.key] = subscriptionRecord;
  }

  return subscriptionsByKey;
}

async function seedAlerts(incidentsByKey, subscriptionsByKey) {
  for (const alert of alertsSeed) {
    const incidentId = incidentsByKey[alert.incidentKey].id;
    const subscriptionId = subscriptionsByKey[alert.subscriptionKey].id;

    const existing = await prisma.alert.findFirst({
      where: {
        incidentId,
        subscriptionId,
      },
    });

    if (existing) {
      await prisma.alert.update({
        where: { id: existing.id },
        data: {
          status: alert.status,
          sentAt: alert.status === 'sent' ? new Date() : null,
        },
      });
      continue;
    }

    await prisma.alert.create({
      data: {
        incidentId,
        subscriptionId,
        status: alert.status,
        sentAt: alert.status === 'sent' ? new Date() : null,
      },
    });
  }
}

async function seedRouteHistory(usersByKey) {
  for (const route of routeHistorySeed) {
    const userId = usersByKey[route.userKey].id;

    const existing = await prisma.routeHistory.findFirst({
      where: {
        userId,
        fromLat: route.fromLat,
        fromLng: route.fromLng,
        toLat: route.toLat,
        toLng: route.toLng,
      },
    });

    if (existing) {
      await prisma.routeHistory.update({
        where: { id: existing.id },
        data: {
          distanceKm: route.distanceKm,
          baseDurationMinutes: route.baseDurationMinutes,
          finalDurationMinutes: route.finalDurationMinutes,
          totalDelayMinutes: route.totalDelayMinutes,
          isFallback: route.isFallback,
        },
      });
      continue;
    }

    await prisma.routeHistory.create({
      data: {
        userId,
        fromLat: route.fromLat,
        fromLng: route.fromLng,
        toLat: route.toLat,
        toLng: route.toLng,
        distanceKm: route.distanceKm,
        baseDurationMinutes: route.baseDurationMinutes,
        finalDurationMinutes: route.finalDurationMinutes,
        totalDelayMinutes: route.totalDelayMinutes,
        isFallback: route.isFallback,
      },
    });
  }
}

async function main() {
  console.log('Starting Prisma seed...');

  const usersByKey = await seedUsers();
  const checkpointsByKey = await seedCheckpoints(usersByKey);
  const incidentsByKey = await seedIncidents(usersByKey, checkpointsByKey);
  const reportsByKey = await seedReports(usersByKey, checkpointsByKey, incidentsByKey);

  await seedReportVotes(usersByKey, reportsByKey);
  await seedModerationAudit(usersByKey, reportsByKey);

  const subscriptionsByKey = await seedSubscriptions(usersByKey);
  await seedAlerts(incidentsByKey, subscriptionsByKey);
  await seedRouteHistory(usersByKey);

  console.log('Seed completed successfully.');
  console.log(`Seed users password: ${DEFAULT_PASSWORD}`);
  console.log(
    `Counts -> users: ${Object.keys(usersByKey).length}, checkpoints: ${Object.keys(checkpointsByKey).length}, incidents: ${Object.keys(incidentsByKey).length}, reports: ${Object.keys(reportsByKey).length}, subscriptions: ${Object.keys(subscriptionsByKey).length}`
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
