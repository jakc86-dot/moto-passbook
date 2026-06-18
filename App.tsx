import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";

type TabKey = "overview" | "maintenance" | "fuel" | "settings";
type ThemeMode = "light" | "dark";
type TextSizeMode = "small" | "normal" | "large";

type AppPreferences = {
  themeMode: ThemeMode;
  textSizeMode: TextSizeMode;
};

type HandoverFlowStatus = "waiting" | "buyer_requested" | "seller_approved" | "completed" | "expired";
type HandoverRole = "seller" | "buyer";

type HandoverSession = {
  role: HandoverRole;
  code: string;
  ownerToken?: string;
  bikeId?: string | null;
  status: HandoverFlowStatus;
  createdAt: string;
  expiresAt: string;
  updatedAt?: string;
};

type BikeProfile = {
  id: string;
  nickname: string;
  manufacturer: string;
  model: string;
  year: string;
  plate: string;
  frameNo: string;
  createdAt: string;
};

type MaintenanceRecord = {
  id: string;
  bikeId?: string;
  date: string;
  odometerKm: number;
  category: string;
  title: string;
  shop: string;
  costKrw: number;
  memo: string;
};

type FuelRecord = {
  id: string;
  bikeId?: string;
  date: string;
  odometerKm: number;
  station: string;
  liters: number;
  costKrw: number;
  memo: string;
};

type OdometerRecord = {
  id: string;
  bikeId?: string;
  date: string;
  odometerKm: number;
  memo: string;
};

type ScheduleItem = {
  id: string;
  bikeId?: string;
  title: string;
  category: string;
  intervalKm: number;
  warningKm: number;
  memo: string;
};

type AppData = {
  version: 1;
  bike: BikeProfile | null;
  bikes: BikeProfile[];
  activeBikeId: string | null;
  maintenanceRecords: MaintenanceRecord[];
  fuelRecords: FuelRecord[];
  odometerRecords: OdometerRecord[];
  schedules: ScheduleItem[];
  dismissedAlertKeys: string[];
  preferences: AppPreferences;
  handoverSession: HandoverSession | null;
};

type MaintenanceHandoverData = {
  version: 1;
  kind: "maintenance-handover";
  code?: string;
  ownerToken?: string;
  status?: HandoverFlowStatus;
  createdAt?: string;
  expiresAt?: string;
  buyerRequestedAt?: string;
  sellerApprovedAt?: string;
  completedAt?: string;
  currentOdometerKm: number;
  bike: BikeProfile | null;
  bikes: BikeProfile[];
  activeBikeId: string | null;
  maintenanceRecords: MaintenanceRecord[];
};

type OdometerActivity = {
  id: string;
  date: string;
  odometerKm: number;
  source: "정비" | "주유" | "키로수";
  title: string;
};

type MaintenanceAlert = ScheduleItem & {
  lastServiceKm: number | null;
  nextDueKm: number;
  dueInKm: number;
  status: "overdue" | "soon" | "upcoming";
};

type PartnerShop = {
  id: string;
  name: string;
  region: string;
  address: string;
  phone: string;
  specialties: string[];
  brands: string[];
  categories: string[];
  services: string[];
  kakaoUrl?: string;
  mapUrl?: string;
};

type BikeForm = {
  manufacturer: string;
  model: string;
  year: string;
  plate: string;
  frameNo: string;
  currentOdometer: string;
};

type MaintenanceForm = {
  date: string;
  odometerKm: string;
  category: string;
  title: string;
  shop: string;
  costKrw: string;
  memo: string;
};

type FuelForm = {
  date: string;
  odometerKm: string;
  station: string;
  liters: string;
  costKrw: string;
  memo: string;
};

type ScheduleForm = {
  title: string;
  category: string;
  intervalKm: string;
  warningKm: string;
  memo: string;
};

type ConfirmRequest = {
  title: string;
  message: string;
  confirmText?: string;
  confirmVariant?: "primary" | "danger";
  onConfirm: () => void | Promise<void>;
};

type CatalogMake = {
  id: string;
  name: string;
};

type CatalogModel = {
  id: string;
  name: string;
};

type DrivetrainType = "chain" | "belt" | "shaft";

type ScheduleTemplate = Omit<ScheduleItem, "id" | "bikeId"> & {
  drivetrains?: DrivetrainType[];
};

const STORAGE_KEY = "moto-passbook-data-v1";
const HANDOVER_STORAGE_PREFIX = "moto-passbook-handover-code-";
const REMINDER_INTERVAL_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VPIC_BASE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles";
const APP_HANDOVER_API_URL = "";
const APP_HANDOVER_API_KEY = "";
const HANDOVER_EXPIRES_HOURS = 48;
const HANDOVER_POLL_MS = 5000;

const preferredMakes = [
  "HONDA",
  "YAMAHA",
  "KAWASAKI",
  "SUZUKI",
  "BMW",
  "DUCATI",
  "HARLEY DAVIDSON",
  "KTM",
  "TRIUMPH",
  "APRILIA",
  "INDIAN",
  "ROYAL ENFIELD",
  "VESPA"
];

const fallbackMakes: CatalogMake[] = preferredMakes.map((name) => ({ id: `fallback-${name}`, name }));

const fallbackModelsByMake: Record<string, CatalogModel[]> = {
  HONDA: ["CB650R", "CBR650R", "CB500F", "CBR500R", "Africa Twin", "Gold Wing", "Rebel 500", "PCX150"].map((name) => ({
    id: `fallback-honda-${name}`,
    name
  })),
  YAMAHA: ["MT-07", "MT-09", "YZF-R7", "YZF-R1", "XSR700", "Tenere 700", "NMAX"].map((name) => ({
    id: `fallback-yamaha-${name}`,
    name
  })),
  KAWASAKI: ["Ninja 400", "Ninja 650", "Z400", "Z650", "Z900", "Versys 650"].map((name) => ({
    id: `fallback-kawasaki-${name}`,
    name
  })),
  SUZUKI: ["SV650", "GSX-S750", "GSX-S1000", "GSX-R1000", "GSX-R1000R", "V-Strom 650", "Hayabusa"].map((name) => ({
    id: `fallback-suzuki-${name}`,
    name
  })),
  BMW: ["R 1250 GS", "R 1250 RT", "R 1200 GS", "R 1300 GS", "S 1000 RR", "F 900 GS", "F 900 R", "G 310 R"].map((name) => ({
    id: `fallback-bmw-${name}`,
    name
  })),
  DUCATI: ["1199 Panigale", "Panigale V2", "Panigale V4", "Monster", "Multistrada V4"].map((name) => ({
    id: `fallback-ducati-${name}`,
    name
  })),
  "HARLEY DAVIDSON": ["Street Glide", "Road Glide", "Fat Boy", "Sportster S", "Iron 883", "Pan America 1250"].map((name) => ({
    id: `fallback-harley-${name}`,
    name
  }))
};

const MIN_VISIBLE_MAKE_MODEL_COUNT = 7;
const visibleMotorcycleMakeIds = new Set(
  [
    446, 452, 474, 509, 510, 527, 564, 565, 566, 567, 568, 570, 574, 590, 591, 596,
    597, 601, 619, 689, 750, 753, 770, 789, 818, 839, 845, 877, 985, 1024, 1043, 1065,
    1068, 1155, 1404, 1480, 1496, 1649, 1768, 1811, 1840, 1853, 1998, 2080, 2156, 2245,
    2342, 2464, 2473, 2536, 2636, 2644, 2659, 2678, 2879, 2906, 2965, 3041, 3115, 3122,
    3128, 3187, 3223, 3309, 3320, 3325, 3350, 3360, 3386, 3395, 3415, 3428, 3430, 3583,
    3669, 3814, 3816, 3825, 3843, 3862, 3863, 3864, 3888, 3956, 3986, 3992, 4007, 4113,
    4192, 4222, 4223, 4441, 4474, 4535, 4599, 4656, 4669, 4737, 4743, 4761, 4785, 4819,
    4821, 4834, 4835, 4842, 4843, 4844, 4858, 4889, 4892, 5030, 5036, 5151, 5302, 5320,
    5679, 5755, 5773, 5820, 5894, 5895, 5896, 5897, 6218, 6480, 6654, 6898, 7151, 7152,
    7153, 7204, 7205, 7206, 7208, 7385, 7565, 7666, 8256, 8498, 8627, 8631, 8634, 8728,
    8914, 9515, 9647, 9664, 9672, 9673, 9674, 9675, 9676, 9677, 9678, 9679, 9680, 9772,
    9775, 9792, 9793, 9831, 9849, 9898, 9920, 9938, 10019, 10032, 10033, 10077, 10134,
    10156, 10221, 10298, 10400, 10407, 10538, 10774, 10903, 10949, 11131, 11156, 11336,
    11337, 11338, 11345, 11370, 11448, 11488, 11535, 11578, 11581, 11583, 11624, 11697,
    11713, 11718, 11721, 11757, 11787, 11887, 11909, 11973, 11974, 12018, 12019, 12040,
    12041, 12192, 12193, 12203, 12204, 12261, 12269, 12270, 12337, 12338, 12456, 12470,
    12536, 12537, 12538, 12539, 12542, 12543, 12554, 12555, 12558, 12559, 12594, 12595,
    12596, 12597, 12712, 12713, 12714, 12715, 12716, 12767, 12805, 12806, 12869, 12987,
    12998, 13041, 13044, 13045, 13046, 13047, 13048, 13054, 13057, 13059, 13060, 13061,
    13066, 13067, 13068, 13069, 13070, 13071, 13185, 13199, 13261, 13335, 13389, 13426,
    13427, 13428, 13429, 13430, 13431, 13432, 13433, 13449, 13450, 13484, 13485, 13491,
    13492, 13494, 13495, 13497, 13498, 13499, 13526, 13644, 13671, 13672, 13722, 13858,
    14046, 14047, 14048, 14049, 14052
  ].map(String)
);

const defaultSchedules: Array<ScheduleTemplate & { id: string }> = [
  {
    id: "schedule-engine-oil",
    title: "엔진오일 교환",
    category: "엔진오일",
    intervalKm: 5000,
    warningKm: 800,
    memo: "차량 상태와 보유 자료에 맞게 주기를 수정해서 사용하세요."
  },
  {
    id: "schedule-engine-oil-filter",
    title: "엔진오일 필터 교환",
    category: "엔진오일",
    intervalKm: 10000,
    warningKm: 1000,
    memo: "엔진오일 교환 주기와 함께 확인하세요."
  },
  {
    id: "schedule-air-filter",
    title: "에어필터 점검/교환",
    category: "필터",
    intervalKm: 12000,
    warningKm: 1000,
    memo: "먼지 많은 환경이나 우천 주행이 잦으면 더 자주 확인하세요."
  },
  {
    id: "schedule-spark-plug",
    title: "점화플러그 점검/교환",
    category: "점화",
    intervalKm: 24000,
    warningKm: 1500,
    memo: "시동성, 아이들링, 연비 변화가 있으면 주기 전에도 점검하세요."
  },
  {
    id: "schedule-brake-fluid",
    title: "브레이크액 교환",
    category: "브레이크",
    intervalKm: 20000,
    warningKm: 1500,
    memo: "거리와 관계없이 제동감이 달라지면 점검하세요."
  },
  {
    id: "schedule-tire",
    title: "타이어 마모 점검",
    category: "타이어",
    intervalKm: 5000,
    warningKm: 700,
    memo: "편마모, 균열, 공기압을 함께 확인하세요."
  },
  {
    id: "schedule-coolant",
    title: "냉각수 점검/교환",
    category: "점검",
    intervalKm: 24000,
    warningKm: 1500,
    memo: "수랭식 차량은 냉각수량, 색상, 누수 흔적을 함께 확인하세요."
  }
];

const defaultScheduleTemplates: ScheduleTemplate[] = defaultSchedules.map(({ id, ...schedule }) => schedule);

const commonManualInspectionTemplates: ScheduleTemplate[] = [
  {
    title: "브레이크 패드/디스크 점검",
    category: "브레이크",
    intervalKm: 6000,
    warningKm: 800,
    memo: "정비 참고 항목: 패드 잔량, 디스크 마모, 제동 소음을 함께 확인하세요."
  },
  {
    title: "브레이크 레버/페달 작동 점검",
    category: "브레이크",
    intervalKm: 6000,
    warningKm: 800,
    memo: "정비 참고 항목: 레버 유격, 페달 복귀, 제동등 작동을 확인하세요."
  },
  {
    title: "타이어 공기압/손상 점검",
    category: "타이어",
    intervalKm: 1000,
    warningKm: 200,
    memo: "정비 참고 항목: 공기압, 못 박힘, 균열, 편마모를 함께 확인하세요."
  },
  {
    title: "조향 베어링/핸들 유격 점검",
    category: "점검",
    intervalKm: 12000,
    warningKm: 1000,
    memo: "정비 참고 항목: 핸들 걸림, 유격, 베어링 소음을 확인하세요."
  },
  {
    title: "서스펜션 누유/작동 점검",
    category: "점검",
    intervalKm: 12000,
    warningKm: 1000,
    memo: "정비 참고 항목: 포크 오일 누유, 리어 쇼크 작동, 고무 부싱 상태를 확인하세요."
  },
  {
    title: "배터리/충전 전압 점검",
    category: "전기",
    intervalKm: 6000,
    warningKm: 800,
    memo: "정비 참고 항목: 배터리 단자, 충전 전압, 시동성을 확인하세요."
  },
  {
    title: "등화류/스위치 작동 점검",
    category: "전기",
    intervalKm: 6000,
    warningKm: 800,
    memo: "정비 참고 항목: 전조등, 방향지시등, 브레이크등, 혼, 스위치를 확인하세요."
  },
  {
    title: "냉각수/호스 누수 점검",
    category: "점검",
    intervalKm: 12000,
    warningKm: 1000,
    memo: "정비 참고 항목: 냉각수량, 라디에이터 캡, 호스 균열과 누수를 확인하세요."
  },
  {
    title: "볼트/너트 체결 점검",
    category: "점검",
    intervalKm: 6000,
    warningKm: 800,
    memo: "정비 참고 항목: 주요 체결부 풀림, 스탠드, 풋페그, 브래킷을 확인하세요."
  }
];

const drivetrainScheduleTemplates: Record<DrivetrainType, ScheduleTemplate[]> = {
  chain: [
    {
      title: "체인 청소/윤활",
      category: "체인",
      intervalKm: 1000,
      warningKm: 200,
      memo: "우천 주행이나 세차 후에는 주기와 관계없이 확인하세요.",
      drivetrains: ["chain"]
    },
    {
      title: "체인 장력 점검/조정",
      category: "체인",
      intervalKm: 1000,
      warningKm: 200,
      memo: "늘어짐, 편마모, 소음이 있으면 조정 또는 교환을 검토하세요.",
      drivetrains: ["chain"]
    },
    {
      title: "대소기어 스프로킷 마모 점검",
      category: "구동계",
      intervalKm: 5000,
      warningKm: 700,
      memo: "앞/뒤 스프로킷 이빨 마모, 휘어짐, 체인과의 물림 상태를 확인하세요.",
      drivetrains: ["chain"]
    },
    {
      title: "체인/대소기어 세트 교환 검토",
      category: "구동계",
      intervalKm: 25000,
      warningKm: 2000,
      memo: "체인과 스프로킷은 함께 마모되므로 세트 교환 여부를 정비소에서 확인하세요.",
      drivetrains: ["chain"]
    }
  ],
  belt: [
    {
      title: "드라이브 벨트 장력/손상 점검",
      category: "벨트",
      intervalKm: 5000,
      warningKm: 700,
      memo: "벨트 장력, 균열, 돌 끼임, 치형 손상을 확인하세요.",
      drivetrains: ["belt"]
    },
    {
      title: "벨트 풀리 마모 점검",
      category: "구동계",
      intervalKm: 10000,
      warningKm: 1000,
      memo: "앞/뒤 풀리 치형 마모와 정렬 상태를 확인하세요.",
      drivetrains: ["belt"]
    },
    {
      title: "드라이브 벨트 교환 검토",
      category: "벨트",
      intervalKm: 40000,
      warningKm: 3000,
      memo: "균열, 이빨 손상, 장력 조정 한계가 보이면 교환을 검토하세요.",
      drivetrains: ["belt"]
    }
  ],
  shaft: [
    {
      title: "파이널드라이브 오일 점검/교환",
      category: "샤프트",
      intervalKm: 20000,
      warningKm: 1500,
      memo: "샤프트 구동 차량은 파이널드라이브 오일과 누유 흔적을 확인하세요.",
      drivetrains: ["shaft"]
    },
    {
      title: "샤프트/유니버설 조인트 점검",
      category: "샤프트",
      intervalKm: 20000,
      warningKm: 1500,
      memo: "유격, 소음, 부트 손상, 진동이 있으면 전문 정비소 점검을 권장합니다.",
      drivetrains: ["shaft"]
    },
    {
      title: "파이널드라이브 누유/부트 점검",
      category: "샤프트",
      intervalKm: 10000,
      warningKm: 1000,
      memo: "리어 허브 주변 누유, 고무 부트 갈라짐, 이물 유입 흔적을 확인하세요.",
      drivetrains: ["shaft"]
    }
  ]
};

const mergeableScheduleGroup = (schedule: ScheduleTemplate) => {
  const title = schedule.title;
  const category = schedule.category;

  if (
    category === "체인" &&
    title.includes("체인") &&
    ["청소", "윤활", "장력", "점검", "조정"].some((word) => title.includes(word))
  ) {
    return {
      key: "chain-routine",
      title: "체인 청소/윤활 및 장력 점검",
      memo: "체인 청소, 윤활, 장력, 편마모, 소음을 한 번에 확인하세요."
    };
  }

  if (category === "엔진오일" && title.includes("엔진오일") && title.includes("교환")) {
    return {
      key: "engine-oil",
      title: "엔진오일 및 필터 교환",
      memo: "엔진오일과 오일 필터를 같은 주기로 함께 관리하세요."
    };
  }

  if (category === "브레이크" && title.includes("점검") && !title.includes("액")) {
    return {
      key: "brake-inspection",
      title: "브레이크 패드/디스크 및 레버/페달 점검",
      memo: "패드 잔량, 디스크 마모, 레버/페달 작동, 제동등을 함께 확인하세요."
    };
  }

  if (category === "전기" && title.includes("점검")) {
    return {
      key: "electrical-inspection",
      title: "배터리/충전 전압 및 등화류/스위치 점검",
      memo: "배터리 단자, 충전 전압, 시동성, 전조등, 방향지시등, 브레이크등, 혼, 스위치를 함께 확인하세요."
    };
  }

  if (category === "샤프트" && title.includes("점검") && !title.includes("누유/부트")) {
    return {
      key: "shaft-drive-service",
      title: "파이널드라이브 오일 및 샤프트 조인트 점검",
      memo: "파이널드라이브 오일, 누유 흔적, 샤프트/유니버설 조인트 유격과 소음을 함께 확인하세요."
    };
  }

  if (category === "구동계" && title.includes("오일") && (title.includes("프라이머리") || title.includes("트랜스미션"))) {
    return {
      key: "primary-transmission-oil",
      title: "프라이머리/트랜스미션 오일 점검/교환",
      memo: "프라이머리와 트랜스미션 오일 상태, 누유, 변속감 변화를 함께 확인하세요."
    };
  }

  return null;
};

const mergedScheduleMemo = (groupMemo: string, memos: string[]) => {
  const specificMemos = memos
    .map((memo) => memo.replace(groupMemo, "").trim())
    .filter(Boolean);
  return Array.from(new Set([groupMemo, ...specificMemos])).join(" ");
};

const mergeEquivalentSchedules = (schedules: ScheduleTemplate[]) => {
  const merged: ScheduleTemplate[] = [];
  const mergeIndexByKey = new Map<string, number>();

  schedules.forEach((schedule) => {
    const group = mergeableScheduleGroup(schedule);
    if (!group) {
      merged.push(schedule);
      return;
    }

    const key = group.key;
    const existingIndex = mergeIndexByKey.get(key);
    if (existingIndex === undefined) {
      mergeIndexByKey.set(key, merged.length);
      merged.push({
        ...schedule,
        title: group.title,
        memo: mergedScheduleMemo(group.memo, [schedule.memo])
      });
      return;
    }

    const existing = merged[existingIndex];
    const hasDifferentTiming = existing.intervalKm !== schedule.intervalKm || existing.warningKm !== schedule.warningKm;
    merged[existingIndex] = {
      ...existing,
      intervalKm: Math.min(existing.intervalKm, schedule.intervalKm),
      warningKm: Math.min(existing.warningKm, schedule.warningKm),
      title: group.title,
      memo: mergedScheduleMemo(group.memo, [
        existing.memo,
        schedule.memo,
        hasDifferentTiming ? "세부 항목 주기가 다르면 가장 짧은 주기로 알림합니다." : ""
      ])
    };
  });

  return merged;
};

const withCommonManualInspections = (templates: ScheduleTemplate[], drivetrain: DrivetrainType = "chain") => {
  const seen = new Set<string>();
  const filtered = [...templates, ...drivetrainScheduleTemplates[drivetrain], ...commonManualInspectionTemplates].filter((schedule) => {
    if (schedule.drivetrains && !schedule.drivetrains.includes(drivetrain)) return false;
    const key = `${schedule.category}-${schedule.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return mergeEquivalentSchedules(filtered);
};

const genericScheduleTemplates: ScheduleTemplate[] = defaultScheduleTemplates;

const internetScheduleCatalog: Array<{
  make: string;
  modelIncludes: string[];
  source: string;
  schedules: ScheduleTemplate[];
}> = [
  {
    make: "HONDA",
    modelIncludes: ["CB650R", "CBR650R"],
    source: "Honda/Boon Siew CB650R 공개 정비표",
    schedules: [
      {
        title: "드라이브 체인 점검/윤활",
        category: "체인",
        intervalKm: 1000,
        warningKm: 200,
        memo: "인터넷 정비표 기준: Drive Chain every 1,000 km."
      },
      {
        title: "엔진오일 교환",
        category: "엔진오일",
        intervalKm: 12000,
        warningKm: 1000,
        memo: "인터넷 정비표 기준: CB650R/CBR650R 정비표의 반복 주기 기준으로 등록했습니다."
      },
      {
        title: "엔진오일 필터 교환",
        category: "엔진오일",
        intervalKm: 12000,
        warningKm: 1000,
        memo: "인터넷 정비표 기준: 엔진오일 주기와 함께 관리하세요."
      },
      {
        title: "스파크 플러그 점검/교환",
        category: "점검",
        intervalKm: 24000,
        warningKm: 1500,
        memo: "인터넷 정비표 기준: Spark Plug every 24,000 km, replace every 48,000 km."
      },
      {
        title: "브레이크액 교환",
        category: "브레이크",
        intervalKm: 24000,
        warningKm: 1500,
        memo: "인터넷 정비표 기준: Brake Fluid 2 years. 앱에서는 거리 알림으로도 함께 관리합니다."
      }
    ]
  },
  {
    make: "YAMAHA",
    modelIncludes: ["MT-07", "YZF-R7", "R7"],
    source: "Yamaha MT-07 공개 정비표",
    schedules: [
      {
        title: "드라이브 체인 청소/윤활",
        category: "체인",
        intervalKm: 1000,
        warningKm: 200,
        memo: "인터넷 정비표 기준: 체인 청소와 윤활 1,000 km 주기."
      },
      {
        title: "엔진오일 및 필터 교환",
        category: "엔진오일",
        intervalKm: 10000,
        warningKm: 1000,
        memo: "인터넷 정비표 기준: MT-07/R7 엔진오일 및 필터 10,000 km 주기."
      },
      {
        title: "에어필터 점검",
        category: "점검",
        intervalKm: 20000,
        warningKm: 1500,
        memo: "인터넷 정비표 기준: 먼지가 많은 환경에서는 더 자주 점검하세요."
      },
      {
        title: "밸브 간극 점검",
        category: "점검",
        intervalKm: 42000,
        warningKm: 2000,
        memo: "인터넷 정비표 기준: valve clearance 42,000 km."
      }
    ]
  },
  {
    make: "SUZUKI",
    modelIncludes: ["GSX-R1000", "GSX-R1000R", "GSXR1000", "R1000R"],
    source: "Suzuki GSX-R1000 공개 정비표",
    schedules: [
      {
        title: "드라이브 체인 청소/윤활",
        category: "체인",
        intervalKm: 1000,
        warningKm: 200,
        memo: "모델 정비표 기준: 체인은 1,000 km마다 청소와 윤활 상태를 확인하세요."
      },
      {
        title: "엔진오일 교환",
        category: "엔진오일",
        intervalKm: 6000,
        warningKm: 800,
        memo: "모델 정비표 기준: GSX-R1000 계열 엔진오일 주기."
      },
      {
        title: "엔진오일 필터 교환",
        category: "엔진오일",
        intervalKm: 18000,
        warningKm: 1500,
        memo: "모델 정비표 기준: 오일 교환 3회 주기로 필터를 별도 관리합니다."
      },
      {
        title: "스파크 플러그 점검/교환",
        category: "점검",
        intervalKm: 12000,
        warningKm: 1000,
        memo: "모델 정비표 기준: 고회전 스포츠 모델이라 점화계 점검을 따로 관리합니다."
      },
      {
        title: "에어클리너 점검",
        category: "점검",
        intervalKm: 12000,
        warningKm: 1000,
        memo: "모델 정비표 기준: 먼지가 많은 환경에서는 더 자주 점검하세요."
      },
      {
        title: "브레이크액 교환",
        category: "브레이크",
        intervalKm: 24000,
        warningKm: 1500,
        memo: "모델 정비표 기준: 거리 알림과 함께 기간 기준도 정비소에서 확인하세요."
      }
    ]
  },
  {
    make: "BMW",
    modelIncludes: ["R 1250 GS", "R1250GS", "R 1250 GSA", "R1250GSA", "R 1200 GS", "R1200GS", "R 1300 GS", "R1300GS"],
    source: "BMW GS 박서 계열 정비 참고표",
    schedules: [
      {
        title: "BMW 정기 서비스",
        category: "점검",
        intervalKm: 10000,
        warningKm: 1000,
        memo: "정비 참고: 표준 서비스는 주행거리와 기간 기준을 함께 확인하세요."
      },
      {
        title: "엔진오일 및 필터 교환",
        category: "엔진오일",
        intervalKm: 10000,
        warningKm: 1000,
        memo: "정비 참고: 박서 엔진 오일과 필터를 함께 관리하세요."
      },
      {
        title: "에어필터 점검/교환",
        category: "필터",
        intervalKm: 20000,
        warningKm: 1500,
        memo: "정비 참고: 먼지가 많은 환경이나 비포장 주행이 잦으면 더 자주 확인하세요."
      },
      {
        title: "점화플러그 점검/교환",
        category: "점화",
        intervalKm: 20000,
        warningKm: 1500,
        memo: "정비 참고: 시동성, 진동, 연비 변화가 있으면 주기 전에도 확인하세요."
      },
      {
        title: "밸브 간극 점검",
        category: "점검",
        intervalKm: 20000,
        warningKm: 1500,
        memo: "정비 참고: 박서 계열 주요 점검 항목으로 관리하세요."
      },
      {
        title: "브레이크액 교환",
        category: "브레이크",
        intervalKm: 10000,
        warningKm: 1000,
        memo: "정비 참고: 기간 기준도 정비소에서 함께 확인하세요."
      }
    ]
  },
  {
    make: "BMW",
    modelIncludes: ["F 900 GS", "F900GS", "F900 GS", "F 900 GSA", "F900GSA"],
    source: "BMW F 900 GS 공개 정비표",
    schedules: [
      {
        title: "BMW 정기 서비스",
        category: "점검",
        intervalKm: 10000,
        warningKm: 1000,
        memo: "모델 정비표 기준: 표준 서비스는 10,000 km 또는 매년 기준으로 관리합니다."
      },
      {
        title: "엔진오일 및 필터 교환",
        category: "엔진오일",
        intervalKm: 10000,
        warningKm: 1000,
        memo: "모델 정비표 기준: 엔진오일과 필터를 정기 서비스와 함께 관리합니다."
      },
      {
        title: "체인 장력/윤활 점검",
        category: "체인",
        intervalKm: 1000,
        warningKm: 200,
        memo: "모델 정비표 기준: 체인 장력과 윤활 상태는 자주 확인하세요."
      },
      {
        title: "밸브 간극 점검",
        category: "점검",
        intervalKm: 20000,
        warningKm: 1500,
        memo: "모델 정비표 기준: 주요 서비스 주기에 맞춰 밸브 간극을 점검합니다."
      },
      {
        title: "스파크 플러그 교환",
        category: "점검",
        intervalKm: 20000,
        warningKm: 1500,
        memo: "모델 정비표 기준: 주요 서비스 주기에 맞춰 점화 플러그를 관리합니다."
      },
      {
        title: "에어필터 교환/점검",
        category: "점검",
        intervalKm: 20000,
        warningKm: 1500,
        memo: "모델 정비표 기준: 오프로드나 먼지가 많은 환경에서는 더 자주 확인하세요."
      },
      {
        title: "브레이크액 교환",
        category: "브레이크",
        intervalKm: 10000,
        warningKm: 1000,
        memo: "모델 정비표 기준: 첫 1년 이후 2년 주기 등 기간 기준도 정비소에서 함께 확인하세요."
      }
    ]
  },
  {
    make: "HARLEY DAVIDSON",
    modelIncludes: ["STREET GLIDE", "ROAD GLIDE", "FAT BOY", "SPORTSTER", "SOFTAIL", "DYNA", "TOURING", "IRON", "BREAKOUT"],
    source: "Harley-Davidson 벨트 구동 정비 참고표",
    schedules: [
      {
        title: "엔진오일 및 필터 교환",
        category: "엔진오일",
        intervalKm: 8000,
        warningKm: 800,
        memo: "정비 참고: 오일 규격과 기간 기준을 함께 확인하세요."
      },
      {
        title: "프라이머리 오일 점검/교환",
        category: "구동계",
        intervalKm: 16000,
        warningKm: 1500,
        memo: "정비 참고: 프라이머리 구동계 오일 상태와 누유를 확인하세요."
      },
      {
        title: "트랜스미션 오일 점검/교환",
        category: "구동계",
        intervalKm: 16000,
        warningKm: 1500,
        memo: "정비 참고: 변속감 변화나 누유가 있으면 주기 전에도 확인하세요."
      },
      {
        title: "에어필터 점검/교환",
        category: "필터",
        intervalKm: 8000,
        warningKm: 800,
        memo: "정비 참고: 흡기 필터 오염과 고정 상태를 확인하세요."
      },
      {
        title: "점화플러그 점검/교환",
        category: "점화",
        intervalKm: 16000,
        warningKm: 1500,
        memo: "정비 참고: 시동성, 아이들링, 가속 반응 변화를 함께 확인하세요."
      }
    ]
  }
];

const emptyData: AppData = {
  version: 1,
  bike: null,
  bikes: [],
  activeBikeId: null,
  maintenanceRecords: [],
  fuelRecords: [],
  odometerRecords: [],
  schedules: [],
  dismissedAlertKeys: [],
  preferences: {
    themeMode: "light",
    textSizeMode: "normal"
  },
  handoverSession: null
};

const categories = ["엔진오일", "필터", "점화", "타이어", "브레이크", "체인", "벨트", "샤프트", "구동계", "전기", "외장", "점검", "기타"];

const inferMaintenanceCategory = (title: string, fallback = "기타") => {
  const value = title.replace(/\s+/g, "");
  if (/브레이크|패드|디스크|제동|브레이크액/.test(value)) return "브레이크";
  if (/엔진오일|오일필터/.test(value)) return "엔진오일";
  if (/에어필터|필터|클리너/.test(value)) return "필터";
  if (/점화|플러그|스파크/.test(value)) return "점화";
  if (/타이어|공기압|편마모/.test(value)) return "타이어";
  if (/체인/.test(value)) return "체인";
  if (/벨트/.test(value)) return "벨트";
  if (/샤프트|파이널드라이브/.test(value)) return "샤프트";
  if (/대소기어|스프로킷|구동/.test(value)) return "구동계";
  if (/배터리|전기|전조등|방향지시등|브레이크등|혼|스위치/.test(value)) return "전기";
  if (/외장|카울|커버/.test(value)) return "외장";
  if (/점검|확인/.test(value)) return "점검";
  return fallback;
};

const partnerShops: PartnerShop[] = [];

type IsoDateParts = {
  year: number;
  month: number;
  day: number;
};

const makeIsoDate = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

const todayIso = () => {
  const now = new Date();

  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    const parts = formatter.formatToParts(now);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return makeIsoDate(year, month, day);
    }
  } catch {
    // Some native runtimes may not expose full Intl timezone support.
  }

  return makeIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

const isoDateParts = (date?: string | null): IsoDateParts | null => {
  if (typeof date !== "string") return null;
  const match = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;

  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }

  return { year, month, day };
};

const isoDateToMs = (parts: IsoDateParts) => Date.UTC(parts.year, parts.month - 1, parts.day);
const sanitizeIsoDate = (date?: string | null) => {
  const parts = isoDateParts(date);
  return parts ? makeIsoDate(parts.year, parts.month, parts.day) : todayIso();
};

const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const newHandoverCode = () =>
  Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join("");
const newHandoverOwnerToken = () => `${Date.now().toString(36)}-${newId("owner")}-${Math.random().toString(36).slice(2, 10)}`;
const normalizeHandoverCode = (value: string) => value.replace(/\D/g, "").slice(0, 12);
const formatHandoverCode = (value: string) =>
  normalizeHandoverCode(value)
    .replace(/(\d{4})(?=\d)/g, "$1 ")
    .trim();
const handoverExpiresAt = () => new Date(Date.now() + HANDOVER_EXPIRES_HOURS * 60 * 60 * 1000).toISOString();
const isIsoExpired = (iso?: string | null) => Boolean(iso && new Date(iso).getTime() <= Date.now());
const normalizeHandoverStatus = (status?: string | null): HandoverFlowStatus =>
  status === "buyer_requested" || status === "seller_approved" || status === "completed" || status === "expired"
    ? status
    : "waiting";
const normalizeHandoverSession = (session?: Partial<HandoverSession> | null): HandoverSession | null => {
  const code = normalizeHandoverCode(session?.code ?? "");
  if (code.length !== 12) return null;
  const createdAt = session?.createdAt ?? new Date().toISOString();
  const expiresAt = session?.expiresAt ?? handoverExpiresAt();
  return {
    role: session?.role === "buyer" ? "buyer" : "seller",
    code,
    ownerToken: session?.ownerToken,
    bikeId: session?.bikeId ?? null,
    status: isIsoExpired(expiresAt) ? "expired" : normalizeHandoverStatus(session?.status),
    createdAt,
    expiresAt,
    updatedAt: session?.updatedAt
  };
};
const handoverFlowStatusText = (status?: HandoverFlowStatus | null) => {
  if (status === "buyer_requested") return "구매자 승인 요청됨";
  if (status === "seller_approved") return "판매자 승인 완료";
  if (status === "completed") return "인계 완료";
  if (status === "expired") return "48시간 만료";
  return "구매자 요청 대기";
};
const handoverApiBaseUrl = () => APP_HANDOVER_API_URL.trim().replace(/\/+$/g, "");
const hasAdminHandoverCloud = () => Boolean(handoverApiBaseUrl());
const handoverCollectionUrl = () => {
  const base = handoverApiBaseUrl();
  return base.endsWith("/handovers") ? base : `${base}/handovers`;
};
const handoverDocumentUrl = (code: string) => `${handoverCollectionUrl()}/${encodeURIComponent(code)}`;
const handoverApiHeaders = () => ({
  "Content-Type": "application/json",
  ...(APP_HANDOVER_API_KEY.trim()
    ? { Authorization: `Bearer ${APP_HANDOVER_API_KEY.trim()}`, "x-api-key": APP_HANDOVER_API_KEY.trim() }
    : {})
});
const numberOnly = (value: string) => Number(value.replace(/[^0-9.]/g, ""));
const formatKm = (value: number) => `${Math.round(value).toLocaleString("ko-KR")} km`;
const formatKrw = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const normalizeCatalogText = (value: string) => value.trim().replace(/\s+/g, " ");
const normalizeFrameSuffix = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(-4);
const catalogKey = (value: string) => normalizeCatalogText(value).toUpperCase();
const looseCatalogKey = (value: string) => catalogKey(value).replace(/[^A-Z0-9]/g, "");
const shopSearchQuery = (bike: BikeProfile, schedule?: ScheduleItem | null) =>
  normalizeCatalogText(
    ["오토바이 정비소", bike.manufacturer, bike.model, schedule?.category, schedule?.title].filter(Boolean).join(" ")
  );
const mapSearchByTextUrl = (text: string) => `https://map.kakao.com/?q=${encodeURIComponent(text)}`;
const mapSearchUrl = (bike: BikeProfile, schedule?: ScheduleItem | null) =>
  mapSearchByTextUrl(shopSearchQuery(bike, schedule));
const openExternalUrl = async (url: string) => {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert("연결 실패", "외부 앱이나 브라우저를 열 수 없습니다.");
  }
};
const stableIdPart = (value: string) => {
  const ascii = catalogKey(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  let hash = 0;
  Array.from(value).forEach((char) => {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  });
  return `h${(hash >>> 0).toString(36)}`;
};

const uniqueCatalogItems = <T extends { name: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = catalogKey(item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const rankCatalogMake = (name: string) => {
  const index = preferredMakes.indexOf(catalogKey(name));
  return index === -1 ? preferredMakes.length : index;
};

const hasAnyModelToken = (model: string, tokens: string[]) => {
  const looseModel = looseCatalogKey(model);
  return tokens.some((token) => model.includes(catalogKey(token)) || looseModel.includes(looseCatalogKey(token)));
};

const drivetrainForBike = (bike: BikeProfile): DrivetrainType => {
  const make = catalogKey(bike.manufacturer);
  const model = catalogKey(bike.model);

  if (make.includes("BMW")) {
    if (
      hasAnyModelToken(model, [
        "R 1150",
        "R1150",
        "R 1200",
        "R1200",
        "R 1250",
        "R1250",
        "R 1300",
        "R1300",
        "K 1600",
        "K1600"
      ])
    ) {
      return "shaft";
    }
    return "chain";
  }

  if (make.includes("HARLEY")) {
    return hasAnyModelToken(model, ["PAN AMERICA", "RA1250"]) ? "chain" : "belt";
  }

  if (make.includes("INDIAN")) {
    return hasAnyModelToken(model, ["FTR"]) ? "chain" : "belt";
  }

  if (make.includes("MOTO GUZZI")) return "shaft";
  if (make.includes("TRIUMPH") && hasAnyModelToken(model, ["ROCKET", "TROPHY"])) return "shaft";
  if (make.includes("HONDA") && hasAnyModelToken(model, ["GOLD WING", "GL1800", "ST1300", "CTX1300"])) return "shaft";
  if (make.includes("YAMAHA") && hasAnyModelToken(model, ["V STAR", "DRAG STAR", "FJR1300"])) return "shaft";
  if (make.includes("KAWASAKI") && hasAnyModelToken(model, ["VOYAGER", "CONCOURS", "GTR1400", "VULCAN 1700"])) return "shaft";
  if (make.includes("SUZUKI") && hasAnyModelToken(model, ["BOULEVARD C", "BOULEVARD M", "INTRUDER C", "INTRUDER M"])) {
    return "shaft";
  }

  return "chain";
};

const scheduleCatalogEntryForBike = (bike: BikeProfile) => {
  const make = catalogKey(bike.manufacturer);
  const model = catalogKey(bike.model);
  const looseMake = looseCatalogKey(bike.manufacturer);
  const looseModel = looseCatalogKey(bike.model);
  return internetScheduleCatalog.find(
    (entry) =>
      (make.includes(entry.make) || looseMake.includes(looseCatalogKey(entry.make))) &&
      entry.modelIncludes.some(
        (modelName) => model.includes(catalogKey(modelName)) || looseModel.includes(looseCatalogKey(modelName))
      )
  );
};

const scheduleSourceForBike = (bike: BikeProfile) => {
  return scheduleCatalogEntryForBike(bike)?.source ?? "기본 정비주기";
};

const isGeneratedScheduleForBike = (schedule: ScheduleItem, bike: BikeProfile) =>
  schedule.id.startsWith(`schedule-${bike.id}-`);

const scheduleMergeKey = (schedule: Pick<ScheduleTemplate, "category" | "title" | "intervalKm" | "warningKm" | "memo">) =>
  mergeableScheduleGroup(schedule)?.key ?? `${schedule.category}-${schedule.title}`.toLowerCase();

const mergeScheduleItems = (existing: ScheduleItem, schedule: ScheduleItem): ScheduleItem => {
  const group = mergeableScheduleGroup(existing) ?? mergeableScheduleGroup(schedule);
  if (!group) return existing;
  const hasDifferentTiming = existing.intervalKm !== schedule.intervalKm || existing.warningKm !== schedule.warningKm;
  return {
    ...existing,
    intervalKm: Math.min(existing.intervalKm, schedule.intervalKm),
    warningKm: Math.min(existing.warningKm, schedule.warningKm),
    title: group.title,
    memo: mergedScheduleMemo(group.memo, [
      existing.memo,
      schedule.memo,
      hasDifferentTiming ? "세부 항목 주기가 다르면 가장 짧은 주기로 알림합니다." : ""
    ])
  };
};

const mergeDuplicateGeneratedSchedules = (schedules: ScheduleItem[], bikes: BikeProfile[]) => {
  const bikesById = new Map(bikes.map((bike) => [bike.id, bike]));
  const merged: ScheduleItem[] = [];
  const mergeIndexByKey = new Map<string, number>();

  schedules.forEach((schedule) => {
    const bike = schedule.bikeId ? bikesById.get(schedule.bikeId) : null;
    if (!bike || !isGeneratedScheduleForBike(schedule, bike)) {
      merged.push(schedule);
      return;
    }

    const key = `${bike.id}-${scheduleMergeKey(schedule)}`;
    const existingIndex = mergeIndexByKey.get(key);
    if (existingIndex === undefined) {
      mergeIndexByKey.set(key, merged.length);
      merged.push(schedule);
      return;
    }

    merged[existingIndex] = mergeScheduleItems(merged[existingIndex], schedule);
  });

  return merged;
};

const uniqueSchedules = (schedules: ScheduleItem[]) => {
  const seen = new Set<string>();
  return schedules.filter((schedule) => {
    if (!schedule.id) return true;
    if (seen.has(schedule.id)) return false;
    seen.add(schedule.id);
    return true;
  });
};

const schedulesForBike = (bike: BikeProfile): Array<ScheduleItem & { bikeId: string }> => {
  const matched = scheduleCatalogEntryForBike(bike);
  const drivetrain = drivetrainForBike(bike);
  const source = scheduleSourceForBike(bike);
  const templates = withCommonManualInspections(matched?.schedules ?? genericScheduleTemplates, drivetrain);

  return templates.map(({ drivetrains, ...schedule }, index) => ({
    ...schedule,
    id: `schedule-${bike.id}-${index}-${stableIdPart(`${schedule.category}-${schedule.title}`)}`,
    bikeId: bike.id,
    memo: sanitizeScheduleMemo(`${schedule.memo} · 출처: ${source}`)
  }));
};

const applyModelSchedules = (schedules: ScheduleItem[], bike: BikeProfile) => {
  const source = scheduleSourceForBike(bike);
  const legacySource = scheduleCatalogEntryForBike(bike)?.source ?? "기본 정비주기";
  const bikeSchedules = schedules.filter((schedule) => schedule.bikeId === bike.id);
  const generated = bikeSchedules.filter((schedule) => isGeneratedScheduleForBike(schedule, bike));
  const hasCurrentGeneratedSource = generated.some(
    (schedule) => schedule.memo.includes(`출처: ${source}`) || schedule.memo.includes(`출처: ${legacySource}`)
  );
  const expectedGenerated = schedulesForBike(bike);
  const expectedKeys = new Set(expectedGenerated.map(scheduleMergeKey));
  if (bikeSchedules.length && !generated.length) {
    return schedules;
  }
  if (bikeSchedules.length && hasCurrentGeneratedSource) {
    const currentGeneratedKeys = new Set(generated.map(scheduleMergeKey));
    const missingGenerated = expectedGenerated.filter(
      (expected) => !currentGeneratedKeys.has(scheduleMergeKey(expected))
    );
    const cleanedSchedules = mergeDuplicateGeneratedSchedules(
      schedules.filter(
        (schedule) =>
          schedule.bikeId !== bike.id ||
          !isGeneratedScheduleForBike(schedule, bike) ||
          expectedKeys.has(scheduleMergeKey(schedule))
      ),
      [bike]
    );
    return missingGenerated.length || cleanedSchedules.length !== schedules.length
      ? [...cleanedSchedules, ...missingGenerated]
      : schedules;
  }
  return [
    ...schedules.filter((schedule) => schedule.bikeId !== bike.id || !isGeneratedScheduleForBike(schedule, bike)),
    ...expectedGenerated
  ];
};

const fetchMotorcycleMakes = async (): Promise<CatalogMake[]> => {
  const response = await fetch(`${VPIC_BASE_URL}/GetMakesForVehicleType/motorcycle?format=json`);
  const payload = await response.json();
  const results = Array.isArray(payload.Results) ? payload.Results : [];
  const makes: CatalogMake[] = results
    .map((item: { MakeId?: number; MakeName?: string }) => ({
      id: String(item.MakeId ?? item.MakeName ?? newId("make")),
      name: normalizeCatalogText(item.MakeName ?? "")
    }))
    .filter((item: CatalogMake) => item.name);
  return uniqueCatalogItems<CatalogMake>(makes)
    .filter((item) => visibleMotorcycleMakeIds.has(item.id))
    .sort(
      (a, b) => rankCatalogMake(a.name) - rankCatalogMake(b.name) || a.name.localeCompare(b.name)
    );
};

const fetchMotorcycleModels = async (make: string, year: string): Promise<CatalogModel[]> => {
  if (!make.trim()) return [];
  const yearValue = numberOnly(year);
  const encodedMake = encodeURIComponent(make.trim());
  const yearPath = yearValue > 1995 ? `/modelyear/${yearValue}` : "";
  const response = await fetch(
    `${VPIC_BASE_URL}/GetModelsForMakeYear/make/${encodedMake}${yearPath}/vehicletype/motorcycle?format=json`
  );
  const payload = await response.json();
  const results = Array.isArray(payload.Results) ? payload.Results : [];
  const models: CatalogModel[] = results
    .map((item: { Model_ID?: number; Model_Name?: string }) => ({
      id: String(item.Model_ID ?? item.Model_Name ?? newId("model")),
      name: normalizeCatalogText(item.Model_Name ?? "")
    }))
    .filter((item: CatalogModel) => item.name);
  return uniqueCatalogItems<CatalogModel>(models).sort((a, b) => a.name.localeCompare(b.name));
};

const uploadMaintenanceHandoverToCloud = async (code: string, data: MaintenanceHandoverData) => {
  const response = await fetch(handoverCollectionUrl(), {
    method: "POST",
    headers: handoverApiHeaders(),
    body: JSON.stringify({
      code,
      kind: data.kind,
      ownerToken: data.ownerToken,
      status: data.status ?? "waiting",
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      data
    })
  });
  const payload = (await response.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    error?: string | { message?: string };
  };
  if (!response.ok) {
    const errorMessage = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(payload.message || errorMessage || "관리자 클라우드에 인계 데이터를 저장하지 못했습니다.");
  }
  return normalizeHandoverCode(payload.code ?? code) || code;
};

const updateMaintenanceHandoverInCloud = async (
  code: string,
  patch: Partial<MaintenanceHandoverData>,
  ownerToken?: string
) => {
  const response = await fetch(handoverDocumentUrl(code), {
    method: "PATCH",
    headers: handoverApiHeaders(),
    body: JSON.stringify({
      ...patch,
      code,
      ownerToken,
      updatedAt: new Date().toISOString()
    })
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Partial<MaintenanceHandoverData> & Partial<AppData>;
    handover?: Partial<MaintenanceHandoverData> & Partial<AppData>;
    message?: string;
    error?: string | { message?: string };
  };
  if (!response.ok) {
    const errorMessage = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(payload.message || errorMessage || "인계 상태를 관리자 클라우드에 저장하지 못했습니다.");
  }
  return normalizeMaintenanceHandoverData(
    payload.data ?? payload.handover ?? (payload as Partial<MaintenanceHandoverData> & Partial<AppData>)
  );
};

const deleteMaintenanceHandoverFromCloud = async (code: string, ownerToken?: string) => {
  const response = await fetch(handoverDocumentUrl(code), {
    method: "DELETE",
    headers: handoverApiHeaders(),
    body: JSON.stringify({ ownerToken })
  });
  if (!response.ok && response.status !== 404) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string | { message?: string } };
    const errorMessage = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(payload.message || errorMessage || "인계 데이터를 관리자 클라우드에서 삭제하지 못했습니다.");
  }
};

const downloadMaintenanceHandoverFromCloud = async (code: string) => {
  const response = await fetch(handoverDocumentUrl(code), {
    headers: handoverApiHeaders()
  });
  const payload = (await response.json().catch(() => ({}))) as {
    data?: Partial<MaintenanceHandoverData> & Partial<AppData>;
    handover?: Partial<MaintenanceHandoverData> & Partial<AppData>;
    message?: string;
    error?: string | { message?: string };
  };
  if (!response.ok) {
    const errorMessage = typeof payload.error === "string" ? payload.error : payload.error?.message;
    throw new Error(payload.message || errorMessage || "인계 코드를 관리자 클라우드에서 찾지 못했습니다.");
  }
  return normalizeMaintenanceHandoverData(
    payload.data ?? payload.handover ?? (payload as Partial<MaintenanceHandoverData> & Partial<AppData>)
  );
};

const readStoredMaintenanceHandover = async (code: string) => {
  const saved = await AsyncStorage.getItem(`${HANDOVER_STORAGE_PREFIX}${code}`);
  return saved ? normalizeMaintenanceHandoverData(JSON.parse(saved) as Partial<MaintenanceHandoverData> & Partial<AppData>) : null;
};

const writeStoredMaintenanceHandover = async (code: string, data: MaintenanceHandoverData) => {
  await AsyncStorage.setItem(`${HANDOVER_STORAGE_PREFIX}${code}`, JSON.stringify(normalizeMaintenanceHandoverData(data)));
};

const updateStoredMaintenanceHandover = async (code: string, patch: Partial<MaintenanceHandoverData>) => {
  const current = await readStoredMaintenanceHandover(code);
  if (!current) throw new Error("현재 기기에서 찾을 수 없는 인계 코드입니다.");
  const next = normalizeMaintenanceHandoverData({ ...current, ...patch, code });
  await writeStoredMaintenanceHandover(code, next);
  return next;
};

const removeStoredMaintenanceHandover = async (code: string) => {
  await AsyncStorage.removeItem(`${HANDOVER_STORAGE_PREFIX}${code}`);
};

const loadMaintenanceHandover = async (code: string) => {
  if (hasAdminHandoverCloud()) return downloadMaintenanceHandoverFromCloud(code);
  const saved = await readStoredMaintenanceHandover(code);
  if (!saved) throw new Error("현재 기기에서 찾을 수 없는 인계 코드입니다.");
  return saved;
};

const updateMaintenanceHandover = async (
  code: string,
  patch: Partial<MaintenanceHandoverData>,
  ownerToken?: string
) => {
  if (hasAdminHandoverCloud()) return updateMaintenanceHandoverInCloud(code, patch, ownerToken);
  return updateStoredMaintenanceHandover(code, patch);
};

const deleteMaintenanceHandover = async (code: string, ownerToken?: string) => {
  if (hasAdminHandoverCloud()) {
    await deleteMaintenanceHandoverFromCloud(code, ownerToken);
    return;
  }
  await removeStoredMaintenanceHandover(code);
};

const sanitizeMaintenanceRecord = (record: MaintenanceRecord): MaintenanceRecord => ({
  id: record.id,
  bikeId: record.bikeId,
  date: sanitizeIsoDate(record.date),
  odometerKm: record.odometerKm,
  category: record.category,
  title: record.title,
  shop: record.shop,
  costKrw: record.costKrw,
  memo: record.memo
});

const sanitizeFuelRecord = (record: FuelRecord): FuelRecord => ({
  ...record,
  date: sanitizeIsoDate(record.date)
});

const sanitizeOdometerRecord = (record: OdometerRecord): OdometerRecord => ({
  ...record,
  date: sanitizeIsoDate(record.date)
});

const latestOdometerFromData = (data: Partial<AppData>) =>
  [
    ...(data.maintenanceRecords ?? []),
    ...(data.fuelRecords ?? []),
    ...(data.odometerRecords ?? [])
  ].reduce((latest, record) => Math.max(latest, Number(record.odometerKm) || 0), 0);

const sanitizeBikeProfile = (bike: BikeProfile): BikeProfile => ({
  ...bike,
  nickname: bike.model || bike.nickname || "등록 바이크",
  frameNo: normalizeFrameSuffix(bike.frameNo || ""),
  createdAt: sanitizeIsoDate(bike.createdAt)
});

const stripScheduleMemoLabels = (memo: string) =>
  memo.replace(
    /(^|[.·]\s*)\s*(제조사 정기점검 항목|인터넷 정비표 기준|모델 정비표 기준|정비 참고 항목|정비 참고):\s*/g,
    "$1"
  );

const sanitizeScheduleMemo = (memo: string) =>
  dedupeScheduleMemo(
    stripScheduleMemoLabels(
      memo
        .replace(/제조사 매뉴얼에 맞게/g, "차량 상태와 보유 자료에 맞게")
        .replace(/제조사 매뉴얼 기준으로/g, "사용자 기준으로")
        .replace(/제조사 매뉴얼 기준/g, "사용자 기준")
        .replace(/제조사 매뉴얼/g, "정비 참고자료")
    )
  );

const displayScheduleMemo = (memo: string) =>
  sanitizeScheduleMemo(memo)
    .replace(/\s*·\s*(체인|벨트|샤프트)\s*구동/g, "")
    .replace(/\s*(체인|벨트|샤프트)\s*구동\s*·\s*/g, "")
    .replace(/\s*·\s*출처:\s*[^·]+(\s*·\s*)?/g, (_match, nextSeparator) => (nextSeparator ? " · " : ""))
    .replace(/\.\s*·/g, ". ·")
    .replace(/\s*·\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

const dedupeScheduleMemo = (memo: string) => {
  const [body, source] = memo.split(" · 출처:");
  const sentences = body
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const dedupedBody = Array.from(new Set(sentences)).join(" ");
  return source === undefined ? dedupedBody : `${dedupedBody} · 출처:${source}`;
};

const sanitizeScheduleItem = (schedule: ScheduleItem): ScheduleItem => ({
  ...schedule,
  memo: sanitizeScheduleMemo(schedule.memo)
});

const normalizeData = (
  source?: Partial<AppData> | null,
  options: { hydrateMissingSchedules?: boolean } = {}
): AppData => {
  const hydrateMissingSchedules = options.hydrateMissingSchedules ?? true;
  const legacyBike = source?.bike ?? null;
  const rawBikes = source?.bikes?.length ? source.bikes : legacyBike ? [legacyBike] : [];
  const bikes = rawBikes.map(sanitizeBikeProfile);
  const activeBikeId =
    source?.activeBikeId && bikes.some((bike) => bike.id === source.activeBikeId)
      ? source.activeBikeId
      : bikes[0]?.id ?? null;
  const activeBike = bikes.find((bike) => bike.id === activeBikeId) ?? null;
  const fallbackBikeId = activeBikeId ?? legacyBike?.id ?? bikes[0]?.id ?? "";
  const withBikeId = <T extends { bikeId?: string }>(records: T[] = []) =>
    records
      .map((record) => ({ ...record, bikeId: record.bikeId || fallbackBikeId }))
      .filter((record) => record.bikeId);

  let schedules: ScheduleItem[] = withBikeId(source?.schedules ?? []).map(sanitizeScheduleItem);
  const scheduleBikeIds = new Set(schedules.map((schedule) => schedule.bikeId).filter(Boolean));
  if (hydrateMissingSchedules) {
    bikes.forEach((bike) => {
      if (!scheduleBikeIds.has(bike.id)) {
        schedules.push(...schedulesForBike(bike));
      } else {
        schedules = applyModelSchedules(schedules, bike);
      }
    });
  }

  const themeMode: ThemeMode = source?.preferences?.themeMode === "dark" ? "dark" : "light";
  const textSizeMode: TextSizeMode =
    source?.preferences?.textSizeMode === "small" || source?.preferences?.textSizeMode === "large"
      ? source.preferences.textSizeMode
      : "normal";
  const normalizedSchedules = mergeDuplicateGeneratedSchedules(uniqueSchedules(schedules), bikes);
  const scheduleIds = new Set(normalizedSchedules.map((schedule) => schedule.id));
  const dismissedAlertKeys = Array.from(
    new Set(
      (source?.dismissedAlertKeys ?? []).filter(
        (key): key is string => typeof key === "string" && scheduleIds.has(key.split(":")[0])
      )
    )
  );

  return {
    version: 1,
    bike: activeBike,
    bikes,
    activeBikeId: activeBike?.id ?? null,
    maintenanceRecords: withBikeId(source?.maintenanceRecords ?? []).map(sanitizeMaintenanceRecord),
    fuelRecords: withBikeId(source?.fuelRecords ?? []).map(sanitizeFuelRecord),
    odometerRecords: withBikeId(source?.odometerRecords ?? []).map(sanitizeOdometerRecord),
    schedules: normalizedSchedules,
    dismissedAlertKeys,
    preferences: {
      themeMode,
      textSizeMode
    },
    handoverSession: normalizeHandoverSession(source?.handoverSession)
  };
};

const normalizeMaintenanceHandoverData = (
  source?: (Partial<MaintenanceHandoverData> & Partial<AppData>) | null
): MaintenanceHandoverData => {
  const rawBikes = source?.bikes?.length ? source.bikes : source?.bike ? [source.bike] : [];
  const bikes = rawBikes.map(sanitizeBikeProfile);
  const activeBikeId =
    source?.activeBikeId && bikes.some((bike) => bike.id === source.activeBikeId)
      ? source.activeBikeId
      : bikes[0]?.id ?? null;
  const activeBike = bikes.find((bike) => bike.id === activeBikeId) ?? bikes[0] ?? null;
  const fallbackBikeId = activeBikeId ?? activeBike?.id ?? "";
  const maintenanceRecords = (source?.maintenanceRecords ?? [])
    .map((record) =>
      sanitizeMaintenanceRecord({
        ...record,
        bikeId: record.bikeId || fallbackBikeId
      })
    )
    .filter((record) => record.bikeId);
  const currentOdometerKm = Math.max(
    0,
    Number(source?.currentOdometerKm) || maintenanceRecords.reduce((latest, record) => Math.max(latest, record.odometerKm), 0)
  );

  return {
    version: 1,
    kind: "maintenance-handover",
    code: source?.code ? normalizeHandoverCode(source.code) : undefined,
    ownerToken: source?.ownerToken,
    status: isIsoExpired(source?.expiresAt) ? "expired" : normalizeHandoverStatus(source?.status),
    createdAt: source?.createdAt ?? new Date().toISOString(),
    expiresAt: source?.expiresAt,
    buyerRequestedAt: source?.buyerRequestedAt,
    sellerApprovedAt: source?.sellerApprovedAt,
    completedAt: source?.completedAt,
    currentOdometerKm,
    bike: activeBike,
    bikes,
    activeBikeId: activeBike?.id ?? null,
    maintenanceRecords
  };
};

const buildMaintenanceHandoverData = (
  source: AppData,
  code?: string,
  ownerToken?: string,
  status: HandoverFlowStatus = "waiting"
): MaintenanceHandoverData =>
  normalizeMaintenanceHandoverData({
    code,
    ownerToken,
    status,
    createdAt: new Date().toISOString(),
    expiresAt: handoverExpiresAt(),
    currentOdometerKm: latestOdometerFromData(source),
    bike: source.bike,
    bikes: source.bikes,
    activeBikeId: source.activeBikeId,
    maintenanceRecords: source.maintenanceRecords
  });

const mergeImportedMaintenanceData = (current: AppData, imported: MaintenanceHandoverData): AppData => {
  const importedBikeIds = new Set(imported.bikes.map((bike) => bike.id));

  return normalizeData(
    {
      ...current,
      bike: imported.bike ?? current.bike,
      activeBikeId: imported.activeBikeId ?? current.activeBikeId,
      bikes: [...current.bikes.filter((bike) => !importedBikeIds.has(bike.id)), ...imported.bikes],
      maintenanceRecords: [
        ...current.maintenanceRecords.filter((record) => !record.bikeId || !importedBikeIds.has(record.bikeId)),
        ...imported.maintenanceRecords
      ],
      fuelRecords: current.fuelRecords,
      odometerRecords: current.odometerRecords,
      schedules: current.schedules,
      handoverSession: null
    },
    { hydrateMissingSchedules: false }
  );
};

const removeBikeFromData = (current: AppData, targetBikeId?: string | null): AppData => {
  if (!targetBikeId) return current;
  const nextBikes = current.bikes.filter((bike) => bike.id !== targetBikeId);
  const nextActiveBike =
    current.activeBikeId && current.activeBikeId !== targetBikeId
      ? nextBikes.find((bike) => bike.id === current.activeBikeId) ?? nextBikes[0] ?? null
      : nextBikes[0] ?? null;

  return normalizeData({
    ...current,
    bike: nextActiveBike,
    activeBikeId: nextActiveBike?.id ?? null,
    bikes: nextBikes,
    maintenanceRecords: current.maintenanceRecords.filter((record) => record.bikeId !== targetBikeId),
    fuelRecords: current.fuelRecords.filter((record) => record.bikeId !== targetBikeId),
    odometerRecords: current.odometerRecords.filter((record) => record.bikeId !== targetBikeId),
    schedules: current.schedules.filter((schedule) => schedule.bikeId !== targetBikeId),
    handoverSession: null
  });
};

const parseDate = (date: string) => {
  const parts = isoDateParts(date) ?? isoDateParts(todayIso());
  return parts ? isoDateToMs(parts) : Date.now();
};

const diffDays = (later: string, earlier: string) =>
  Math.max(0, Math.floor((parseDate(later) - parseDate(earlier)) / MS_PER_DAY));

const addDays = (date: string, days: number) => {
  const next = new Date(parseDate(date) + days * MS_PER_DAY);
  if (Number.isNaN(next.getTime())) return todayIso();
  return makeIsoDate(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
};

const buildActivities = (data: AppData): OdometerActivity[] =>
  [
    ...data.maintenanceRecords.map((record) => ({
      id: record.id,
      date: record.date,
      odometerKm: record.odometerKm,
      source: "정비" as const,
      title: record.title
    })),
    ...data.fuelRecords.map((record) => ({
      id: record.id,
      date: record.date,
      odometerKm: record.odometerKm,
      source: "주유" as const,
      title: record.station
    })),
    ...data.odometerRecords.map((record) => ({
      id: record.id,
      date: record.date,
      odometerKm: record.odometerKm,
      source: "키로수" as const,
      title: "현재 키로수 입력"
    }))
  ].sort((a, b) => parseDate(b.date) - parseDate(a.date) || b.odometerKm - a.odometerKm);

const latestOdometerFrom = (activities: OdometerActivity[]) =>
  activities.reduce((latest, activity) => Math.max(latest, activity.odometerKm), 0);

const buildScheduleAlerts = (
  schedules: ScheduleItem[],
  maintenanceRecords: MaintenanceRecord[],
  latestOdometer: number
): MaintenanceAlert[] =>
  schedules
    .map((schedule) => {
      const matched = maintenanceRecords
        .filter(
          (record) =>
            record.category === schedule.category ||
            record.title.includes(schedule.title) ||
            schedule.title.includes(record.category)
        )
        .sort((a, b) => b.odometerKm - a.odometerKm)[0];
      const lastServiceKm = matched?.odometerKm ?? null;
      const nextDueKm = lastServiceKm
        ? lastServiceKm + schedule.intervalKm
        : schedule.intervalKm;
      const dueInKm = nextDueKm - latestOdometer;
      const status: MaintenanceAlert["status"] =
        dueInKm <= 0 ? "overdue" : dueInKm <= schedule.warningKm ? "soon" : "upcoming";

      return {
        ...schedule,
        lastServiceKm,
        nextDueKm,
        dueInKm,
        status
      };
    })
    .sort((a, b) => a.dueInKm - b.dueInKm);

const maintenanceAlertDismissKey = (alert: Pick<MaintenanceAlert, "id" | "nextDueKm" | "status">) =>
  `${alert.id}:${alert.nextDueKm}:${alert.status}`;

const textScaleFor = (mode: TextSizeMode) => {
  if (mode === "small") return 0.92;
  if (mode === "large") return 1.12;
  return 1;
};

const makeThemeStyles = (themeMode: ThemeMode, textSizeMode: TextSizeMode) => {
  const scale = textScaleFor(textSizeMode);
  const isDark = themeMode === "dark";
  const palette = isDark
    ? {
        background: "#111827",
        surface: "#1F2937",
        raised: "#243244",
        ink: "#F8FAFC",
        muted: "#CBD5E1",
        border: "#334155",
        tab: "#182131",
        button: "#0E7C7B"
      }
    : {
        background: colors.background,
        surface: colors.surface,
        raised: "#EEF3F7",
        ink: colors.ink,
        muted: colors.muted,
        border: colors.border,
        tab: "#E6EBF0",
        button: colors.ink
      };

  return StyleSheet.create({
    safeArea: {
      backgroundColor: palette.background
    },
    scrollContent: {
      backgroundColor: palette.background
    },
    tabBar: {
      backgroundColor: palette.tab
    },
    tabButton: {
      backgroundColor: "transparent"
    },
    activeTabButton: {
      backgroundColor: palette.surface
    },
    tabText: {
      color: palette.muted,
      fontSize: 14 * scale
    },
    activeTabText: {
      color: palette.ink
    },
    bikeChip: {
      backgroundColor: palette.surface,
      borderColor: palette.border
    },
    activeBikeChip: {
      backgroundColor: isDark ? "#123A3A" : "#E7FFFA",
      borderColor: colors.teal
    },
    bikeChipTitle: {
      color: palette.ink,
      fontSize: 13 * scale
    },
    bikeChipMeta: {
      color: palette.muted,
      fontSize: 11 * scale
    },
    activeBikeChipTitle: {
      color: isDark ? "#B8F5EB" : colors.teal
    },
    activeBikeChipMeta: {
      color: isDark ? "#9ADBD5" : colors.teal
    },
    metricCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border
    },
    metricLabel: {
      color: palette.muted,
      fontSize: 12 * scale
    },
    metricValue: {
      color: palette.ink,
      fontSize: 19 * scale
    },
    sectionTitle: {
      color: palette.ink,
      fontSize: 21 * scale
    },
    cardTitle: {
      color: palette.ink,
      fontSize: 17 * scale
    },
    cardSubtitle: {
      color: palette.muted,
      fontSize: 13 * scale
    },
    cardDetail: {
      color: palette.muted,
      fontSize: 13 * scale
    },
    alertCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border
    },
    alertDue: {
      color: palette.ink,
      fontSize: 16 * scale
    },
    alertStatusButton: {
      backgroundColor: isDark ? "#243244" : "#EEF3F7"
    },
    alertStatusText: {
      color: isDark ? "#D8E7F5" : colors.navy,
      fontSize: 13 * scale
    },
    alertDeleteButton: {
      backgroundColor: isDark ? "#3B2524" : "#FCEAE7",
      borderColor: isDark ? "#75463F" : "#E2B0A7"
    },
    alertDeleteButtonText: {
      color: isDark ? "#FFB6AA" : colors.red,
      fontSize: 13 * scale
    },
    statusPill: {
      backgroundColor: isDark ? "#243244" : "#EEF3F7",
      color: isDark ? "#D8E7F5" : colors.navy,
      fontSize: 12 * scale
    },
    findShopButton: {
      backgroundColor: isDark ? "#123A3A" : "#E8F7F4",
      borderColor: isDark ? "#1B5D5A" : "#B9E4DD"
    },
    findShopButtonText: {
      color: isDark ? "#B8F5EB" : colors.teal,
      fontSize: 12 * scale
    },
    mutedText: {
      color: palette.muted,
      fontSize: 13 * scale
    },
    mutedStrong: {
      color: palette.muted,
      fontSize: 12 * scale
    },
    infoPanel: {
      backgroundColor: palette.surface,
      borderColor: palette.border
    },
    recordCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border
    },
    amountText: {
      color: palette.ink,
      fontSize: 14 * scale
    },
    emptyState: {
      backgroundColor: isDark ? "#172235" : "#EEF3F7",
      borderColor: palette.border
    },
    emptyTitle: {
      color: palette.ink,
      fontSize: 16 * scale
    },
    emptyCopy: {
      color: palette.muted,
      fontSize: 13 * scale
    },
    handoverCodeCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border
    },
    handoverCodeText: {
      color: palette.ink,
      fontSize: 28 * scale
    },
    input: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      color: palette.ink,
      fontSize: 15 * scale
    },
    formSectionLabel: {
      color: palette.ink,
      fontSize: 13 * scale
    },
    catalogStatus: {
      color: palette.muted,
      fontSize: 12 * scale
    },
    chip: {
      backgroundColor: palette.surface,
      borderColor: palette.border
    },
    chipText: {
      color: palette.muted,
      fontSize: 13 * scale
    },
    modalSafeArea: {
      backgroundColor: palette.background
    },
    modalHeader: {
      borderBottomColor: palette.border
    },
    modalTitle: {
      color: palette.ink,
      fontSize: 18 * scale
    },
    preferencePanel: {
      backgroundColor: palette.surface,
      borderColor: palette.border
    },
    preferenceButton: {
      backgroundColor: palette.raised,
      borderColor: palette.border
    },
    preferenceButtonActive: {
      backgroundColor: "#E7FFFA",
      borderColor: colors.teal
    },
    preferenceButtonText: {
      color: palette.muted,
      fontSize: 13 * scale
    },
    preferenceButtonTextActive: {
      color: colors.teal
    },
    quickActionText: {
      fontSize: 15 * scale
    },
    dangerButtonText: {
      fontSize: 14 * scale
    },
    bikeDeleteInlineButton: {
      backgroundColor: isDark ? "#331D1C" : "#FCEAE7",
      borderColor: isDark ? "#7F3A31" : "#E2B0A7"
    },
    handoverPanel: {
      backgroundColor: isDark ? colors.ink : palette.surface,
      borderColor: palette.border,
      borderWidth: isDark ? 0 : 1
    },
    handoverEyebrow: {
      color: colors.teal,
      fontSize: 12 * scale
    },
    handoverTitle: {
      color: palette.ink,
      fontSize: 24 * scale
    },
    handoverCopy: {
      color: palette.muted,
      fontSize: 14 * scale
    },
    transferStat: {
      backgroundColor: isDark ? "rgba(255,255,255,0.11)" : "#F3F7FA",
      borderColor: isDark ? "rgba(255,255,255,0.12)" : palette.border
    },
    transferStatValue: {
      color: palette.ink,
      fontSize: 18 * scale
    },
    transferStatLabel: {
      color: palette.muted,
      fontSize: 12 * scale
    },
    handoverDivider: {
      backgroundColor: isDark ? "rgba(255,255,255,0.14)" : palette.border
    },
    handoverImportTitle: {
      color: palette.ink,
      fontSize: 21 * scale
    },
    handoverInlineCodeCard: {
      backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "#F6F9FB",
      borderColor: isDark ? "rgba(255,255,255,0.14)" : palette.border
    },
    handoverPanelCodeText: {
      color: palette.ink,
      fontSize: 28 * scale
    },
    handoverStatusText: {
      color: palette.muted,
      fontSize: 13 * scale
    },
    handoverPanelInput: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      color: palette.ink
    }
  });
};

type ThemeStyles = ReturnType<typeof makeThemeStyles>;

export default function App() {
  const [data, setData] = useState<AppData>(emptyData);
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceTemplate, setMaintenanceTemplate] = useState<Pick<ScheduleItem, "title" | "category" | "memo"> | null>(null);
  const [maintenanceEditTarget, setMaintenanceEditTarget] = useState<MaintenanceRecord | null>(null);
  const [fuelOpen, setFuelOpen] = useState(false);
  const [fuelEditTarget, setFuelEditTarget] = useState<FuelRecord | null>(null);
  const [odometerOpen, setOdometerOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleEditTarget, setScheduleEditTarget] = useState<ScheduleItem | null>(null);
  const [bikeOpen, setBikeOpen] = useState(false);
  const [bikeEditOpen, setBikeEditOpen] = useState(false);
  const [transferText, setTransferText] = useState("");
  const [importText, setImportText] = useState("");
  const [handoverStatus, setHandoverStatus] = useState("");
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const today = useMemo(() => todayIso(), []);
  const preferences = data.preferences ?? emptyData.preferences;
  const themeStyles = useMemo(
    () => makeThemeStyles(preferences.themeMode, preferences.textSizeMode),
    [preferences.themeMode, preferences.textSizeMode]
  );

  const activeBike = useMemo(
    () => data.bikes.find((bike) => bike.id === data.activeBikeId) ?? data.bike,
    [data.activeBikeId, data.bike, data.bikes]
  );
  const activeBikeId = activeBike?.id ?? null;
  const activeData = useMemo<AppData>(() => {
    const forActiveBike = <T extends { bikeId?: string }>(records: T[]) =>
      activeBikeId ? records.filter((record) => record.bikeId === activeBikeId) : [];

    return {
      ...data,
      bike: activeBike ?? null,
      bikes: activeBike ? [activeBike] : [],
      activeBikeId,
      maintenanceRecords: forActiveBike(data.maintenanceRecords),
      fuelRecords: forActiveBike(data.fuelRecords),
      odometerRecords: forActiveBike(data.odometerRecords),
      schedules: forActiveBike(data.schedules)
    };
  }, [activeBike, activeBikeId, data]);

  const activities = useMemo(() => buildActivities(activeData), [activeData]);
  const latestOdometer = useMemo(() => latestOdometerFrom(activities), [activities]);
  const latestActivity = activities[0] ?? null;
  const reminderDue = !latestActivity || diffDays(today, latestActivity.date) >= REMINDER_INTERVAL_DAYS;
  const nextReminderDate = latestActivity ? addDays(latestActivity.date, REMINDER_INTERVAL_DAYS) : today;
  const recentMaintenanceShop =
    activeData.maintenanceRecords
      .map((record) => record.shop.trim())
      .find((shop) => shop && shop !== "직접 기록") ?? "";
  const recentFuelStation =
    activeData.fuelRecords
      .map((record) => record.station.trim())
      .find((station) => station && station !== "주유 기록") ?? "";
  const rawAlerts = useMemo(
    () => buildScheduleAlerts(activeData.schedules, activeData.maintenanceRecords, latestOdometer),
    [activeData.maintenanceRecords, activeData.schedules, latestOdometer]
  );
  const dismissedAlertKeySet = useMemo(
    () => new Set(data.dismissedAlertKeys ?? []),
    [data.dismissedAlertKeys]
  );
  const alerts = useMemo(
    () => rawAlerts.filter((alert) => !dismissedAlertKeySet.has(maintenanceAlertDismissKey(alert))),
    [dismissedAlertKeySet, rawAlerts]
  );

  const openMaintenanceModal = (template?: Pick<ScheduleItem, "title" | "category" | "memo"> | null) => {
    setMaintenanceTemplate(template ?? null);
    setMaintenanceEditTarget(null);
    setMaintenanceOpen(true);
  };

  const openMaintenanceEditModal = (record: MaintenanceRecord) => {
    setMaintenanceTemplate(null);
    setMaintenanceEditTarget(record);
    setMaintenanceOpen(true);
  };

  const openFuelModal = () => {
    setFuelEditTarget(null);
    setFuelOpen(true);
  };

  const openFuelEditModal = (record: FuelRecord) => {
    setFuelEditTarget(record);
    setFuelOpen(true);
  };

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved) {
          const parsed = JSON.parse(saved) as AppData;
          setData(normalizeData(parsed));
        }
      })
      .catch(() => Alert.alert("저장소 오류", "저장된 데이터를 불러오지 못했습니다."))
      .finally(() => setIsHydrated(true));
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() =>
      Alert.alert("저장소 오류", "데이터 저장에 실패했습니다.")
    );
  }, [data, isHydrated]);

  const confirmAction = (
    title: string,
    message: string,
    confirmText: string,
    confirmVariant: "primary" | "danger",
    onConfirm: () => void | Promise<void>
  ) => {
    if (Platform.OS === "web") {
      setConfirmRequest({ title, message, confirmText, confirmVariant, onConfirm });
      return;
    }
    Alert.alert(title, message, [
      { text: "취소", style: "cancel" },
      { text: confirmText, style: confirmVariant === "danger" ? "destructive" : "default", onPress: onConfirm }
    ]);
  };

  const confirmDestructive = (title: string, message: string, onConfirm: () => void | Promise<void>) => {
    confirmAction(title, message, "삭제", "danger", onConfirm);
  };

  const updatePreferences = (patch: Partial<AppPreferences>) => {
    setData((current) => ({
      ...current,
      preferences: {
        ...(current.preferences ?? emptyData.preferences),
        ...patch
      }
    }));
  };

  const saveBike = (bike: BikeProfile, odometerKm = 0) => {
    setData((current) =>
      normalizeData({
        ...current,
        bike,
        activeBikeId: bike.id,
        bikes: current.bikes.some((item) => item.id === bike.id) ? current.bikes : [...current.bikes, bike],
        odometerRecords: [
          {
            id: newId("odo"),
            bikeId: bike.id,
            date: today,
            odometerKm,
            memo: "오토바이 최초 등록 주행거리"
          },
          ...current.odometerRecords
        ],
        schedules: [...current.schedules, ...schedulesForBike(bike)]
      })
    );
    setBikeOpen(false);
    setActiveTab("overview");
    setTransferText("");
    setHandoverStatus("");
  };

  const updateBike = (bike: BikeProfile) => {
    setData((current) =>
      normalizeData({
        ...current,
        bike: current.activeBikeId === bike.id ? bike : current.bike,
        bikes: current.bikes.map((item) => (item.id === bike.id ? bike : item))
      })
    );
    setBikeEditOpen(false);
    setTransferText("");
    setHandoverStatus("");
  };

  const deleteBike = (bikeId?: string | null) => {
    const targetBikeId = typeof bikeId === "string" ? bikeId : activeBikeId;
    const targetBike = data.bikes.find((bike) => bike.id === targetBikeId) ?? activeBike;
    if (!targetBikeId || !targetBike) return;
    confirmDestructive("바이크 삭제", `${targetBike.model} 기록을 이 기기에서 삭제할까요?`, () => {
      setData((current) => removeBikeFromData(current, targetBikeId));
      setActiveTab("overview");
      setTransferText("");
      setHandoverStatus("");
    });
  };

  const addMaintenance = (record: MaintenanceRecord) => {
    if (!activeBikeId) return;
    setData((current) => ({
      ...current,
      maintenanceRecords: [{ ...record, bikeId: activeBikeId }, ...current.maintenanceRecords]
    }));
    setMaintenanceOpen(false);
    setMaintenanceTemplate(null);
    setMaintenanceEditTarget(null);
    setActiveTab("maintenance");
  };

  const updateMaintenance = (record: MaintenanceRecord) => {
    if (!activeBikeId) return;
    setData((current) => ({
      ...current,
      maintenanceRecords: current.maintenanceRecords.map((item) =>
        item.id === record.id ? { ...record, bikeId: item.bikeId ?? activeBikeId } : item
      )
    }));
    setMaintenanceOpen(false);
    setMaintenanceTemplate(null);
    setMaintenanceEditTarget(null);
    setActiveTab("maintenance");
  };

  const addFuel = (record: FuelRecord) => {
    if (!activeBikeId) return;
    setData((current) => ({
      ...current,
      fuelRecords: [{ ...record, bikeId: activeBikeId }, ...current.fuelRecords]
    }));
    setFuelOpen(false);
    setFuelEditTarget(null);
    setActiveTab("fuel");
  };

  const updateFuel = (record: FuelRecord) => {
    if (!activeBikeId) return;
    setData((current) => ({
      ...current,
      fuelRecords: current.fuelRecords.map((item) =>
        item.id === record.id ? { ...record, bikeId: item.bikeId ?? activeBikeId } : item
      )
    }));
    setFuelOpen(false);
    setFuelEditTarget(null);
    setActiveTab("fuel");
  };

  const addOdometer = (record: OdometerRecord) => {
    if (!activeBikeId) return;
    setData((current) => ({
      ...current,
      odometerRecords: [{ ...record, bikeId: activeBikeId }, ...current.odometerRecords]
    }));
    setOdometerOpen(false);
    setActiveTab("maintenance");
  };

  const deleteMaintenance = (record: MaintenanceRecord) => {
    confirmDestructive("정비 기록 삭제", `${record.title} 기록을 삭제할까요?`, () => {
      setData((current) => ({
        ...current,
        maintenanceRecords: current.maintenanceRecords.filter((item) => item.id !== record.id)
      }));
    });
  };

  const deleteFuel = (record: FuelRecord) => {
    confirmDestructive("주유 기록 삭제", `${record.station} 기록을 삭제할까요?`, () => {
      setData((current) => ({
        ...current,
        fuelRecords: current.fuelRecords.filter((item) => item.id !== record.id)
      }));
    });
  };

  const deleteOdometer = (record: OdometerRecord) => {
    confirmDestructive("키로수 기록 삭제", `${formatKm(record.odometerKm)} 기록을 삭제할까요?`, () => {
      setData((current) => ({
        ...current,
        odometerRecords: current.odometerRecords.filter((item) => item.id !== record.id)
      }));
    });
  };

  const addSchedule = (schedule: ScheduleItem) => {
    if (!activeBikeId) return;
    setData((current) => ({
      ...current,
      schedules: [{ ...schedule, bikeId: activeBikeId }, ...current.schedules]
    }));
    setScheduleOpen(false);
    setScheduleEditTarget(null);
    setActiveTab("maintenance");
  };

  const updateSchedule = (schedule: ScheduleItem) => {
    if (!activeBikeId) return;
    setData((current) => ({
      ...current,
      schedules: current.schedules.map((item) =>
        item.id === schedule.id ? { ...schedule, bikeId: item.bikeId ?? activeBikeId } : item
      ),
      dismissedAlertKeys: (current.dismissedAlertKeys ?? []).filter((key) => !key.startsWith(`${schedule.id}:`))
    }));
    setScheduleOpen(false);
    setScheduleEditTarget(null);
    setActiveTab("maintenance");
  };

  const deleteSchedule = (schedule: ScheduleItem) => {
    confirmDestructive("정비주기 삭제", `${schedule.title} 주기를 삭제할까요?`, () => {
      setData((current) => ({
        ...current,
        schedules: current.schedules.filter((item) => item.id !== schedule.id),
        dismissedAlertKeys: (current.dismissedAlertKeys ?? []).filter((key) => !key.startsWith(`${schedule.id}:`))
      }));
    });
  };

  const dismissAlert = (alert: MaintenanceAlert) => {
    const dismissKey = maintenanceAlertDismissKey(alert);
    confirmAction(
      "주의 항목 숨기기",
      `${alert.title} 알림만 홈에서 숨길까요? 정비주기는 정비 탭에 그대로 남습니다.`,
      "숨기기",
      "primary",
      () => {
        setData((current) => ({
          ...current,
          dismissedAlertKeys: Array.from(new Set([...(current.dismissedAlertKeys ?? []), dismissKey]))
        }));
      }
    );
  };

  const resetModelSchedules = () => {
    if (!activeBike) return;
    confirmAction(
      "모델 적용",
      "직접 수정한 정비주기 수정사항이 초기화됩니다. 모델 기준 정비주기로 다시 적용할까요?",
      "모델 적용",
      "primary",
      () => {
        setData((current) =>
          normalizeData({
            ...current,
            dismissedAlertKeys: (current.dismissedAlertKeys ?? []).filter(
              (key) => !key.startsWith(`schedule-${activeBike.id}-`)
            ),
            schedules: [
              ...current.schedules.filter(
                (schedule) => schedule.bikeId !== activeBike.id || !isGeneratedScheduleForBike(schedule, activeBike)
              ),
              ...schedulesForBike(activeBike)
            ]
          })
        );
        setActiveTab("maintenance");
      }
    );
  };

  const generateTransfer = async () => {
    try {
      const code = newHandoverCode();
      const ownerToken = newHandoverOwnerToken();
      const handoverData = buildMaintenanceHandoverData(activeData, code, ownerToken, "waiting");
      if (hasAdminHandoverCloud()) {
        const cloudCode = await uploadMaintenanceHandoverToCloud(code, handoverData);
        setTransferText(cloudCode);
        setData((current) => ({
          ...current,
          handoverSession: {
            role: "seller",
            code: cloudCode,
            ownerToken,
            bikeId: activeBikeId,
            status: "waiting",
            createdAt: handoverData.createdAt ?? new Date().toISOString(),
            expiresAt: handoverData.expiresAt ?? handoverExpiresAt()
          }
        }));
        setHandoverStatus("인계 대기 중 · 구매자가 요청하면 판매자 승인 버튼이 표시됩니다.");
      } else {
        await writeStoredMaintenanceHandover(code, handoverData);
        setData((current) => ({
          ...current,
          handoverSession: {
            role: "seller",
            code,
            ownerToken,
            bikeId: activeBikeId,
            status: "waiting",
            createdAt: handoverData.createdAt ?? new Date().toISOString(),
            expiresAt: handoverData.expiresAt ?? handoverExpiresAt()
          }
        }));
        setTransferText(code);
        setHandoverStatus("인계 대기 중 · 관리자 클라우드 API 미설정 상태에서는 현재 기기에서만 흐름을 테스트할 수 있습니다.");
      }
    } catch (error) {
      Alert.alert("인계 코드", error instanceof Error ? error.message : "인계 코드를 생성하지 못했습니다.");
    }
  };

  const importTransfer = async () => {
    try {
      const code = normalizeHandoverCode(importText);
      if (code.length !== 12) {
        Alert.alert("인계 코드 확인", "12자리 인계 코드를 입력해주세요.");
        return;
      }
      const imported = await loadMaintenanceHandover(code);
      if (isIsoExpired(imported.expiresAt) || imported.status === "expired") {
        await deleteMaintenanceHandover(code, imported.ownerToken);
        setHandoverStatus("48시간이 지나 인계 데이터가 삭제되었습니다. 판매자에게 새 코드를 요청해주세요.");
        Alert.alert("인계 코드 만료", "48시간이 지나 클라우드 인계 데이터가 삭제되었습니다.");
        return;
      }
      if (!imported.bikes.length) {
        Alert.alert("인계 데이터 확인", "Moto Passbook 인계 데이터 형식이 아닙니다.");
        return;
      }
      if (imported.status === "waiting") {
        const requestedAt = new Date().toISOString();
        await updateMaintenanceHandover(code, {
          ...imported,
          status: "buyer_requested",
          buyerRequestedAt: requestedAt
        });
        setData((current) => ({
          ...current,
          handoverSession: {
            role: "buyer",
            code,
            bikeId: imported.activeBikeId,
            status: "buyer_requested",
            createdAt: imported.createdAt ?? requestedAt,
            expiresAt: imported.expiresAt ?? handoverExpiresAt(),
            updatedAt: requestedAt
          }
        }));
        setHandoverStatus("판매자에게 인계 승인 요청을 보냈습니다. 판매자가 승인하면 이 버튼으로 수신할 수 있습니다.");
        return;
      }
      if (imported.status === "buyer_requested") {
        setData((current) => ({
          ...current,
          handoverSession: {
            role: "buyer",
            code,
            bikeId: imported.activeBikeId,
            status: "buyer_requested",
            createdAt: imported.createdAt ?? new Date().toISOString(),
            expiresAt: imported.expiresAt ?? handoverExpiresAt(),
            updatedAt: imported.buyerRequestedAt
          }
        }));
        setHandoverStatus("판매자 승인 대기 중입니다. 승인 후 다시 가져오기를 눌러주세요.");
        return;
      }
      if (imported.status !== "seller_approved") {
        setHandoverStatus("아직 수신할 수 없는 인계 상태입니다.");
        return;
      }
      setData((current) => mergeImportedMaintenanceData(current, imported));
      await updateMaintenanceHandover(code, {
        ...imported,
        status: "completed",
        completedAt: new Date().toISOString()
      });
      setImportText("");
      setTransferText("");
      setHandoverStatus("인계 데이터를 수신했습니다. 판매자 앱에서는 이 바이크 데이터가 자동 삭제됩니다.");
      setActiveTab("overview");
    } catch (error) {
      Alert.alert("인계 코드 확인", error instanceof Error ? error.message : "인계 데이터를 읽을 수 없습니다.");
    }
  };

  const approveTransfer = () => {
    const session = data.handoverSession;
    if (!session || session.role !== "seller" || !session.code) {
      Alert.alert("인계 승인", "승인할 인계 요청이 없습니다.");
      return;
    }
    if (session.status !== "buyer_requested") {
      Alert.alert("인계 승인", "구매자가 먼저 인계 요청을 보내야 승인할 수 있습니다.");
      return;
    }
    confirmAction(
      "인계 승인",
      "승인하면 구매자가 정비 이력을 수신할 수 있습니다. 구매자 수신이 완료되면 이 기기의 해당 바이크 데이터가 자동 삭제됩니다.",
      "승인",
      "primary",
      async () => {
        try {
          const approvedAt = new Date().toISOString();
          await updateMaintenanceHandover(
            session.code,
            {
              status: "seller_approved",
              sellerApprovedAt: approvedAt
            },
            session.ownerToken
          );
          setData((current) => ({
            ...current,
            handoverSession: current.handoverSession
              ? { ...current.handoverSession, status: "seller_approved", updatedAt: approvedAt }
              : current.handoverSession
          }));
          setHandoverStatus("판매자 승인 완료 · 구매자가 수신하면 이 기기에서 해당 바이크가 삭제됩니다.");
        } catch (error) {
          Alert.alert("인계 승인", error instanceof Error ? error.message : "인계 승인을 저장하지 못했습니다.");
        }
      }
    );
  };

  useEffect(() => {
    const session = data.handoverSession;
    if (!isHydrated || !session || !session.code || session.status === "completed") return;

    let cancelled = false;
    const syncHandoverSession = async () => {
      try {
        if (isIsoExpired(session.expiresAt) || session.status === "expired") {
          await deleteMaintenanceHandover(session.code, session.ownerToken);
          if (cancelled) return;
          setData((current) => ({ ...current, handoverSession: null }));
          setTransferText("");
          setHandoverStatus("48시간이 지나 인계 데이터가 클라우드에서 삭제되었습니다.");
          return;
        }

        const remote = await loadMaintenanceHandover(session.code);
        if (cancelled) return;

        if (isIsoExpired(remote.expiresAt) || remote.status === "expired") {
          await deleteMaintenanceHandover(session.code, session.ownerToken ?? remote.ownerToken);
          if (cancelled) return;
          setData((current) => ({ ...current, handoverSession: null }));
          setTransferText("");
          setHandoverStatus("48시간이 지나 인계 데이터가 클라우드에서 삭제되었습니다.");
          return;
        }

        const remoteStatus = normalizeHandoverStatus(remote.status);
        if (session.role === "seller") {
          if (remoteStatus === "buyer_requested" && session.status !== "buyer_requested") {
            setData((current) => ({
              ...current,
              handoverSession: current.handoverSession
                ? { ...current.handoverSession, status: "buyer_requested", updatedAt: remote.buyerRequestedAt ?? new Date().toISOString() }
                : current.handoverSession
            }));
            setHandoverStatus("구매자가 인계를 요청했습니다. 판매자 승인 버튼을 눌러주세요.");
          }
          if (remoteStatus === "seller_approved" && session.status !== "seller_approved") {
            setData((current) => ({
              ...current,
              handoverSession: current.handoverSession
                ? { ...current.handoverSession, status: "seller_approved", updatedAt: remote.sellerApprovedAt ?? new Date().toISOString() }
                : current.handoverSession
            }));
          }
          if (remoteStatus === "completed") {
            const bikeIdToRemove = session.bikeId ?? remote.activeBikeId;
            setData((current) => removeBikeFromData(current, bikeIdToRemove));
            setTransferText("");
            setImportText("");
            setHandoverStatus("구매자 수신 완료 · 판매자 기기에서 해당 바이크 데이터를 삭제했습니다.");
            await deleteMaintenanceHandover(session.code, session.ownerToken ?? remote.ownerToken);
          }
          return;
        }

        if (session.role === "buyer") {
          if (remoteStatus === "seller_approved") {
            setData((current) => mergeImportedMaintenanceData(current, remote));
            await updateMaintenanceHandover(session.code, {
              ...remote,
              status: "completed",
              completedAt: new Date().toISOString()
            });
            setImportText("");
            setTransferText("");
            setHandoverStatus("판매자 승인 완료 · 인계 데이터를 자동 수신했습니다.");
            setActiveTab("overview");
            return;
          }
          if (remoteStatus !== session.status) {
            setData((current) => ({
              ...current,
              handoverSession: current.handoverSession
                ? { ...current.handoverSession, status: remoteStatus, updatedAt: new Date().toISOString() }
                : current.handoverSession
            }));
          }
        }
      } catch {
        // Network errors should not interrupt the app; the next poll or button press can retry.
      }
    };

    syncHandoverSession();
    const timer = setInterval(syncHandoverSession, HANDOVER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [data.handoverSession?.code, data.handoverSession?.role, data.handoverSession?.status, isHydrated]);

  const resetData = () => {
    confirmDestructive("데이터 초기화", "이 기기에 저장된 모든 기록을 삭제할까요?", () => {
      setData(emptyData);
      setActiveTab("overview");
      setTransferText("");
      setImportText("");
      setHandoverStatus("");
    });
  };

  if (!isHydrated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ExpoStatusBar style="dark" />
        <View style={styles.loadingScreen}>
          <Text style={styles.appName}>Moto Passbook</Text>
          <Text style={styles.mutedText}>저장된 기록을 불러오는 중입니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selectBike = (bikeId: string) => {
    const nextBike = data.bikes.find((bike) => bike.id === bikeId);
    if (!nextBike) return;
    setData((current) => ({ ...current, bike: nextBike, activeBikeId: nextBike.id }));
    setTransferText("");
    setHandoverStatus("");
    setActiveTab("overview");
  };

  if (!activeBike) {
    return <BikeRegistrationScreen onSave={saveBike} themeStyles={themeStyles} themeMode={preferences.themeMode} />;
  }

  return (
    <SafeAreaView style={[styles.safeArea, themeStyles.safeArea]}>
      <ExpoStatusBar style={preferences.themeMode === "dark" ? "light" : "dark"} />
      <ScrollView contentContainerStyle={[styles.scrollContent, themeStyles.scrollContent]} showsVerticalScrollIndicator={false}>
        {activeTab === "overview" ? (
          <>
            <BikeSwitcher
              bikes={data.bikes}
              activeBikeId={activeBikeId}
              onSelect={selectBike}
              onAddBike={() => setBikeOpen(true)}
              themeStyles={themeStyles}
            />
            <Hero
              bike={activeBike}
              latestOdometer={latestOdometer}
              alert={alerts[0]}
              reminderDue={reminderDue}
              nextReminderDate={nextReminderDate}
              latestActivityDate={latestActivity?.date ?? null}
              onOpenOdometer={() => setOdometerOpen(true)}
              onOpenBikeManage={() => setBikeEditOpen(true)}
            />
          </>
        ) : null}
        <TabBar activeTab={activeTab} onChange={setActiveTab} themeStyles={themeStyles} />

        {activeTab === "overview" && (
          <OverviewScreen
            data={activeData}
            latestOdometer={latestOdometer}
            alerts={alerts}
            onAddMaintenance={openMaintenanceModal}
            onAddFuel={openFuelModal}
            onDismissAlert={dismissAlert}
            themeStyles={themeStyles}
          />
        )}

        {activeTab === "maintenance" && (
          <MaintenanceScreen
            bike={activeBike}
            maintenanceRecords={activeData.maintenanceRecords}
            schedules={activeData.schedules}
            onAddMaintenance={() => openMaintenanceModal()}
            onEditMaintenance={openMaintenanceEditModal}
            onDeleteMaintenance={deleteMaintenance}
            onAddSchedule={() => {
              setScheduleEditTarget(null);
              setScheduleOpen(true);
            }}
            onEditSchedule={(schedule) => {
              setScheduleEditTarget(schedule);
              setScheduleOpen(true);
            }}
            onResetModelSchedules={resetModelSchedules}
            themeStyles={themeStyles}
          />
        )}

        {activeTab === "fuel" && (
          <FuelScreen
            records={activeData.fuelRecords}
            onAddFuel={openFuelModal}
            onEditFuel={openFuelEditModal}
            onDeleteFuel={deleteFuel}
            themeStyles={themeStyles}
          />
        )}

        {activeTab === "settings" && (
          <SettingsScreen
            handoverData={activeData}
            handoverSession={data.handoverSession}
            transferText={transferText}
            importText={importText}
            handoverStatus={handoverStatus}
            onGenerateTransfer={generateTransfer}
            onChangeImportText={setImportText}
            onImportTransfer={importTransfer}
            onApproveTransfer={approveTransfer}
            preferences={preferences}
            onChangePreferences={updatePreferences}
            themeStyles={themeStyles}
          />
        )}
      </ScrollView>

      <MaintenanceModal
        visible={maintenanceOpen}
        latestOdometer={latestOdometer}
        initialSchedule={maintenanceTemplate}
        initialRecord={maintenanceEditTarget}
        defaultShop={recentMaintenanceShop}
        themeStyles={themeStyles}
        onClose={() => {
          setMaintenanceOpen(false);
          setMaintenanceTemplate(null);
          setMaintenanceEditTarget(null);
        }}
        onSubmit={maintenanceEditTarget ? updateMaintenance : addMaintenance}
      />
      <FuelModal
        visible={fuelOpen}
        latestOdometer={latestOdometer}
        initialRecord={fuelEditTarget}
        defaultStation={recentFuelStation}
        themeStyles={themeStyles}
        onClose={() => {
          setFuelOpen(false);
          setFuelEditTarget(null);
        }}
        onSubmit={fuelEditTarget ? updateFuel : addFuel}
      />
      <OdometerModal
        visible={odometerOpen}
        latestOdometer={latestOdometer}
        themeStyles={themeStyles}
        onClose={() => setOdometerOpen(false)}
        onSubmit={addOdometer}
      />
      <ScheduleModal
        visible={scheduleOpen}
        initialSchedule={scheduleEditTarget}
        themeStyles={themeStyles}
        onClose={() => {
          setScheduleOpen(false);
          setScheduleEditTarget(null);
        }}
        onSubmit={scheduleEditTarget ? updateSchedule : addSchedule}
      />
      <Modal visible={bikeOpen} animationType="slide" transparent onRequestClose={() => setBikeOpen(false)}>
        <View style={[styles.modalHost, themeStyles.safeArea]}>
          <BikeRegistrationScreen
            onSave={saveBike}
            onCancel={() => setBikeOpen(false)}
            eyebrow="바이크 추가"
            title="새 오토바이를 등록하면 기록을 따로 관리할 수 있습니다"
            copy="등록한 바이크마다 정비, 주유, 키로수, 정비주기와 인계 데이터가 분리됩니다."
            submitLabel="바이크 추가"
            themeStyles={themeStyles}
            themeMode={preferences.themeMode}
          />
        </View>
      </Modal>
      <Modal visible={bikeEditOpen} animationType="slide" transparent onRequestClose={() => setBikeEditOpen(false)}>
        <View style={[styles.modalHost, themeStyles.safeArea]}>
          <BikeRegistrationScreen
            onSave={updateBike}
            onCancel={() => setBikeEditOpen(false)}
            initialBike={activeBike}
            isEditing
            eyebrow="바이크 수정"
            title="등록된 오토바이 정보를 수정합니다"
            copy="제조사, 모델, 연식, 번호판, 차대번호 뒤 4자리를 수정할 수 있습니다."
            submitLabel="수정 저장"
            onDelete={() => deleteBike(activeBikeId)}
            themeStyles={themeStyles}
            themeMode={preferences.themeMode}
          />
        </View>
      </Modal>
      <ConfirmModal
        request={confirmRequest}
        onCancel={() => setConfirmRequest(null)}
        onConfirm={() => {
          const action = confirmRequest?.onConfirm;
          setConfirmRequest(null);
          action?.();
        }}
      />
    </SafeAreaView>
  );
}

function ConfirmModal({
  request,
  onCancel,
  onConfirm
}: {
  request: ConfirmRequest | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal transparent visible={Boolean(request)} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmPanel}>
          <Text style={styles.confirmTitle}>{request?.title}</Text>
          <Text style={styles.confirmMessage}>{request?.message}</Text>
          <View style={styles.confirmActions}>
            <Pressable style={styles.secondaryButtonSmall} onPress={onCancel}>
              <Text style={styles.secondaryButtonText}>취소</Text>
            </Pressable>
            <Pressable
              style={request?.confirmVariant === "primary" ? styles.confirmPrimaryButton : styles.confirmDeleteButton}
              onPress={onConfirm}
            >
              <Text style={request?.confirmVariant === "primary" ? styles.confirmPrimaryText : styles.confirmDeleteText}>
                {request?.confirmText ?? "삭제"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BikeSwitcher({
  bikes,
  activeBikeId,
  onSelect,
  onAddBike,
  themeStyles
}: {
  bikes: BikeProfile[];
  activeBikeId: string | null;
  onSelect: (bikeId: string) => void;
  onAddBike: () => void;
  themeStyles: ThemeStyles;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bikeSwitcher}>
      {bikes.map((bike) => {
        const isActive = bike.id === activeBikeId;
        return (
          <View key={bike.id} style={[styles.bikeChip, themeStyles.bikeChip, isActive && styles.activeBikeChip, isActive && themeStyles.activeBikeChip]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              style={styles.bikeChipMain}
              onPress={() => onSelect(bike.id)}
            >
              <Text style={[styles.bikeChipTitle, themeStyles.bikeChipTitle, isActive && styles.activeBikeChipTitle, isActive && themeStyles.activeBikeChipTitle]}>{bike.model}</Text>
              <Text style={[styles.bikeChipMeta, themeStyles.bikeChipMeta, isActive && styles.activeBikeChipMeta, isActive && themeStyles.activeBikeChipMeta]}>
                {bike.manufacturer}
                {bike.plate ? ` · ${bike.plate}` : ""}
              </Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityLabel="바이크 등록" style={styles.bikeAddChip} onPress={onAddBike}>
        <Text style={styles.bikeAddIcon}>＋</Text>
        <Text style={styles.bikeAddText}>등록</Text>
      </Pressable>
    </ScrollView>
  );
}

function BikeRegistrationScreen({
  onSave,
  onCancel,
  initialBike,
  isEditing = false,
  eyebrow = "첫 등록",
  title = "오토바이를 등록하면 바로 기록을 시작할 수 있습니다",
  copy = "입력한 정보와 기록은 이 기기에 저장됩니다. 인계할 때는 데이터를 내보내 다음 소유자가 가져올 수 있습니다.",
  submitLabel = "오토바이 등록",
  onDelete,
  themeStyles = makeThemeStyles("light", "normal"),
  themeMode = "light"
}: {
  onSave: (bike: BikeProfile, odometerKm?: number) => void;
  onCancel?: () => void;
  initialBike?: BikeProfile | null;
  isEditing?: boolean;
  eyebrow?: string;
  title?: string;
  copy?: string;
  submitLabel?: string;
  onDelete?: () => void;
  themeStyles?: ThemeStyles;
  themeMode?: ThemeMode;
}) {
  const [form, setForm] = useState<BikeForm>({
    manufacturer: initialBike?.manufacturer ?? "",
    model: initialBike?.model ?? "",
    year: initialBike?.year ?? "",
    plate: initialBike?.plate ?? "",
    frameNo: initialBike?.frameNo ?? "",
    currentOdometer: ""
  });
  const [manufacturerQuery, setManufacturerQuery] = useState(initialBike?.manufacturer ?? "");
  const [modelQuery, setModelQuery] = useState(initialBike?.model ?? "");
  const [catalogMakes, setCatalogMakes] = useState<CatalogMake[]>(fallbackMakes);
  const [catalogModels, setCatalogModels] = useState<CatalogModel[]>([]);
  const [makeStatus, setMakeStatus] = useState("제조사 목록을 인터넷에서 불러오는 중입니다.");
  const [modelStatus, setModelStatus] = useState("제조사를 선택하면 모델명을 불러옵니다.");

  const update = (key: keyof BikeForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    let cancelled = false;
    setMakeStatus("제조사 목록을 인터넷에서 불러오는 중입니다.");
    fetchMotorcycleMakes()
      .then((makes) => {
        if (cancelled) return;
        setCatalogMakes(makes.length ? makes : fallbackMakes);
        setMakeStatus(
          makes.length
            ? `모델 ${MIN_VISIBLE_MAKE_MODEL_COUNT}개 이상 제조사 ${makes.length}개 불러옴`
            : "인터넷 목록이 비어 있어 기본 목록을 사용합니다."
        );
      })
      .catch(() => {
        if (cancelled) return;
        setCatalogMakes(fallbackMakes);
        setMakeStatus("인터넷 제조사 목록을 불러오지 못해 기본 목록을 사용합니다.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const make = form.manufacturer.trim();
    if (!make) {
      setCatalogModels([]);
      setModelStatus("제조사를 선택하면 모델명을 불러옵니다.");
      return () => {
        cancelled = true;
      };
    }

    setModelStatus(`${make} 모델명을 인터넷에서 불러오는 중입니다.`);
    fetchMotorcycleModels(make, form.year)
      .then((models) => {
        if (cancelled) return;
        const fallbackModels = fallbackModelsByMake[catalogKey(make)] ?? [];
        const nextModels = models.length ? models : fallbackModels;
        setCatalogModels(nextModels);
        setModelStatus(
          nextModels.length
            ? `인터넷 모델 ${nextModels.length}개 불러옴`
            : "모델 목록이 없으면 직접 입력값을 사용하세요."
        );
      })
      .catch(() => {
        if (cancelled) return;
        const fallbackModels = fallbackModelsByMake[catalogKey(make)] ?? [];
        setCatalogModels(fallbackModels);
        setModelStatus(
          fallbackModels.length ? "인터넷 모델 목록을 불러오지 못해 기본 목록을 사용합니다." : "모델명을 직접 입력하세요."
        );
      });

    return () => {
      cancelled = true;
    };
  }, [form.manufacturer, form.year]);

  const selectManufacturer = (name: string) => {
    const nextName = normalizeCatalogText(name);
    setManufacturerQuery(nextName);
    setModelQuery("");
    setForm((current) => ({ ...current, manufacturer: nextName, model: "" }));
  };

  const selectModel = (name: string) => {
    const nextName = normalizeCatalogText(name);
    setModelQuery(nextName);
    setForm((current) => ({ ...current, model: nextName }));
  };

  const filteredMakes = catalogMakes
    .filter((make) => !manufacturerQuery.trim() || catalogKey(make.name).includes(catalogKey(manufacturerQuery)))
    .slice(0, 30);
  const filteredModels = catalogModels
    .filter((model) => !modelQuery.trim() || catalogKey(model.name).includes(catalogKey(modelQuery)))
    .slice(0, 30);

  const submit = () => {
    const odometerKm = numberOnly(form.currentOdometer);
    if (!form.manufacturer.trim() || !form.model.trim() || (!isEditing && odometerKm <= 0)) {
      Alert.alert("오토바이 등록", "인터넷 목록에서 제조사와 모델명을 고르거나 직접 입력하고 현재 주행거리를 입력해주세요.");
      return;
    }

    onSave(
      {
        id: initialBike?.id ?? newId("bike"),
        nickname: form.model.trim(),
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
        year: form.year.trim(),
        plate: form.plate.trim(),
        frameNo: normalizeFrameSuffix(form.frameNo),
        createdAt: initialBike?.createdAt ?? todayIso()
      },
      odometerKm
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, themeStyles.safeArea]}>
      <ExpoStatusBar style={themeMode === "dark" ? "light" : "dark"} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={[styles.scrollContent, themeStyles.scrollContent]} showsVerticalScrollIndicator={false}>
          <View style={styles.onboardingPanel}>
            <View style={styles.onboardingHeader}>
              <Text style={styles.onboardingEyebrow}>{eyebrow}</Text>
              {onCancel ? (
                <Pressable style={styles.onboardingCloseButton} onPress={onCancel}>
                  <Text style={styles.onboardingCloseText}>닫기</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.onboardingTitle}>{title}</Text>
            <Text style={styles.onboardingCopy}>{copy}</Text>
          </View>

          <View style={styles.formStack}>
            <Text style={[styles.formSectionLabel, themeStyles.formSectionLabel]}>제조사 인터넷 검색</Text>
            <TextInput
              value={manufacturerQuery}
              onChangeText={(value) => {
                setManufacturerQuery(value);
                update("manufacturer", normalizeCatalogText(value));
              }}
              placeholder="제조사 검색 예: Honda"
              style={[styles.input, themeStyles.input]}
              placeholderTextColor="#8792A0"
            />
            <Text style={[styles.catalogStatus, themeStyles.catalogStatus]}>{makeStatus}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {filteredMakes.map((make) => {
                const isActive = catalogKey(form.manufacturer) === catalogKey(make.name);
                return (
                  <Pressable
                    key={make.id}
                    style={[styles.chip, themeStyles.chip, isActive && styles.activeChip]}
                    onPress={() => selectManufacturer(make.name)}
                  >
                    <Text style={[styles.chipText, themeStyles.chipText, isActive && styles.activeChipText]}>{make.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <Text style={[styles.formSectionLabel, themeStyles.formSectionLabel]}>모델명 인터넷 검색</Text>
            <TextInput
              value={modelQuery}
              onChangeText={(value) => {
                setModelQuery(value);
                update("model", normalizeCatalogText(value));
              }}
              placeholder="모델명 검색 예: CB650R"
              style={[styles.input, themeStyles.input]}
              placeholderTextColor="#8792A0"
            />
            <Text style={[styles.catalogStatus, themeStyles.catalogStatus]}>{modelStatus}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {filteredModels.map((model) => {
                const isActive = catalogKey(form.model) === catalogKey(model.name);
                return (
                  <Pressable
                    key={model.id}
                    style={[styles.chip, themeStyles.chip, isActive && styles.activeChip]}
                    onPress={() => selectModel(model.name)}
                  >
                    <Text style={[styles.chipText, themeStyles.chipText, isActive && styles.activeChipText]}>{model.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.twoColumn}>
              <TextInput
                value={form.year}
                onChangeText={(value) => update("year", value.replace(/[^0-9]/g, "").slice(0, 4))}
                placeholder="연식"
                keyboardType="number-pad"
                style={[styles.input, themeStyles.input, styles.flex]}
                placeholderTextColor="#8792A0"
              />
              {isEditing ? (
                <View style={[styles.infoPanel, themeStyles.infoPanel, styles.flex]}>
                  <Text style={[styles.mutedStrong, themeStyles.mutedStrong]}>주행거리는 키로수 입력에서 관리합니다.</Text>
                </View>
              ) : (
                <TextInput
                  value={form.currentOdometer}
                  onChangeText={(value) => update("currentOdometer", value)}
                  placeholder="현재 주행거리 km"
                  keyboardType="number-pad"
                  style={[styles.input, themeStyles.input, styles.flex]}
                  placeholderTextColor="#8792A0"
                />
              )}
            </View>
            <View style={styles.twoColumn}>
              <TextInput
                value={form.plate}
                onChangeText={(value) => update("plate", value)}
                placeholder="번호판"
                style={[styles.input, themeStyles.input, styles.flex]}
                placeholderTextColor="#8792A0"
              />
              <TextInput
                value={form.frameNo}
                onChangeText={(value) => update("frameNo", normalizeFrameSuffix(value))}
                placeholder="차대번호 뒤 4자리"
                autoCapitalize="characters"
                maxLength={4}
                style={[styles.input, themeStyles.input, styles.flex]}
                placeholderTextColor="#8792A0"
              />
            </View>
            <Pressable style={styles.primaryButton} onPress={submit}>
              <Text style={styles.primaryButtonText}>{submitLabel}</Text>
            </Pressable>
            {isEditing && onDelete ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="바이크 정보 삭제"
                style={[styles.dangerButton, styles.bikeDeleteInlineButton, themeStyles.bikeDeleteInlineButton]}
                onPress={onDelete}
              >
                <Text style={styles.bikeDeleteInlineIcon}>×</Text>
                <Text style={styles.dangerButtonText}>바이크 정보 삭제</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Hero({
  bike,
  latestOdometer,
  alert,
  reminderDue,
  nextReminderDate,
  latestActivityDate,
  onOpenOdometer,
  onOpenBikeManage
}: {
  bike: BikeProfile;
  latestOdometer: number;
  alert?: MaintenanceAlert;
  reminderDue: boolean;
  nextReminderDate: string;
  latestActivityDate: string | null;
  onOpenOdometer: () => void;
  onOpenBikeManage: () => void;
}) {
  const alertText = alert
    ? alert.dueInKm <= 0
      ? `${alert.title} ${formatKm(Math.abs(alert.dueInKm))} 지남`
      : `${alert.title} ${formatKm(alert.dueInKm)} 남음`
    : "정비주기 등록 필요";
  const reminderText = reminderDue ? "키로수 입력 필요" : `다음 알림 ${nextReminderDate}`;
  return (
    <View style={styles.hero}>
      <View style={styles.heroTopLine}>
        <Text style={styles.heroOwner}>{bike.manufacturer}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="바이크 정보 관리" style={styles.heroGearButton} onPress={onOpenBikeManage}>
          <Text style={styles.heroGearIcon}>⚙</Text>
        </Pressable>
      </View>
      <Text style={styles.heroTitle}>{bike.model}</Text>
      <Text style={styles.heroMeta}>
        {[bike.year ? `${bike.year}년식` : "", bike.frameNo ? `차대번호 끝 ${bike.frameNo}` : "", bike.plate ? `차량번호 ${bike.plate}` : ""]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      <View style={styles.heroMetrics}>
        <View style={styles.heroMetric}>
          <View style={styles.heroMetricHeader}>
            <Text style={styles.metricLabelLight}>현재 주행</Text>
            <Pressable style={styles.heroMetricAction} onPress={onOpenOdometer}>
              <Text style={styles.heroMetricActionText}>키로수 입력</Text>
            </Pressable>
          </View>
          <View style={styles.heroOdometerRow}>
            <Text style={styles.metricValueLight}>{formatKm(latestOdometer)}</Text>
            {latestActivityDate ? <Text style={styles.heroOdometerDate}>{latestActivityDate}</Text> : null}
          </View>
          <Text style={[styles.heroReminderText, reminderDue && styles.heroReminderDueText]}>{reminderText}</Text>
        </View>
        <View style={styles.heroMetric}>
          <Text style={styles.metricLabelLight}>가장 가까운 정비</Text>
          <Text style={styles.metricValueLight}>{alertText}</Text>
        </View>
      </View>
    </View>
  );
}

function TabBar({
  activeTab,
  onChange,
  themeStyles
}: {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  themeStyles: ThemeStyles;
}) {
  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: "overview", label: "홈화면" },
    { key: "maintenance", label: "정비" },
    { key: "fuel", label: "주유" },
    { key: "settings", label: "설정" }
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabBar, themeStyles.tabBar]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tabButton, themeStyles.tabButton, isActive && styles.activeTabButton, isActive && themeStyles.activeTabButton]}
            onPress={() => onChange(tab.key)}
          >
            <Text style={[styles.tabText, themeStyles.tabText, isActive && styles.activeTabText, isActive && themeStyles.activeTabText]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function OverviewScreen({
  data,
  latestOdometer,
  alerts,
  onAddMaintenance,
  onAddFuel,
  onDismissAlert,
  themeStyles
}: {
  data: AppData;
  latestOdometer: number;
  alerts: MaintenanceAlert[];
  onAddMaintenance: (template?: Pick<ScheduleItem, "title" | "category" | "memo"> | null) => void;
  onAddFuel: () => void;
  onDismissAlert: (alert: MaintenanceAlert) => void;
  themeStyles: ThemeStyles;
}) {
  const totalMaintenance = data.maintenanceRecords.reduce((sum, record) => sum + record.costKrw, 0);
  const totalFuel = data.fuelRecords.reduce((sum, record) => sum + record.costKrw, 0);
  const urgentCount = alerts.filter((alert) => alert.status !== "upcoming").length;
  const recentMaintenance = data.maintenanceRecords[0];
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [showAllUrgentAlerts, setShowAllUrgentAlerts] = useState(false);
  const [shopFinderAlert, setShopFinderAlert] = useState<MaintenanceAlert | null>(null);
  const urgentAlerts = alerts.filter((alert) => alert.status !== "upcoming");
  const upcomingAlerts = alerts.filter((alert) => alert.status === "upcoming");
  const hasMoreUrgentAlerts = urgentAlerts.length > 3;
  const visibleUrgentAlerts = showAllUrgentAlerts ? urgentAlerts : urgentAlerts.slice(0, 3);
  const hasMoreAlerts = upcomingAlerts.length > 3;
  const visibleAlerts = showAllAlerts ? upcomingAlerts : upcomingAlerts.slice(0, 3);

  return (
    <View style={styles.screenBlock}>
      <View style={styles.metricGrid}>
        <MetricCard label="현재 주행거리" value={formatKm(latestOdometer)} accent="#0E7C7B" themeStyles={themeStyles} />
        <MetricCard label="정비비 합계" value={formatKrw(totalMaintenance)} accent="#B84A39" themeStyles={themeStyles} />
        <MetricCard label="주유비 합계" value={formatKrw(totalFuel)} accent="#375C9B" themeStyles={themeStyles} />
        <MetricCard label="주의 알림" value={`${urgentCount}건`} accent="#C27A16" themeStyles={themeStyles} />
      </View>

      <View style={styles.quickActions}>
        <Pressable style={[styles.overviewActionButton, styles.overviewMaintenanceButton]} onPress={() => onAddMaintenance()}>
          <Text style={styles.overviewActionIcon}>＋</Text>
          <Text style={[styles.overviewActionText, themeStyles.quickActionText]}>정비</Text>
        </Pressable>
        <Pressable style={[styles.overviewActionButton, styles.overviewFuelButton]} onPress={onAddFuel}>
          <Text style={styles.overviewActionIcon}>＋</Text>
          <Text style={[styles.overviewActionText, themeStyles.quickActionText]}>주유</Text>
        </Pressable>
      </View>

      {urgentAlerts.length ? (
        <>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>주의 항목</Text>
            </View>
            <View style={styles.headerActions}>
              <Text style={styles.pill}>{urgentAlerts.length}건</Text>
              {hasMoreUrgentAlerts ? (
                <Pressable
                  accessibilityLabel={showAllUrgentAlerts ? "주의 항목 접기" : "주의 항목 전체보기"}
                  accessibilityRole="button"
                  style={styles.viewAllButton}
                  onPress={() => setShowAllUrgentAlerts((current) => !current)}
                >
                  <Text style={styles.viewAllIcon}>{showAllUrgentAlerts ? "⌃" : "☰"}</Text>
                  <Text style={styles.viewAllText}>{showAllUrgentAlerts ? "접기" : "전체보기"}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={styles.listGap}>
            {visibleUrgentAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                onRecordMaintenance={() => onAddMaintenance(alert)}
                onDeleteAlert={() => onDismissAlert(alert)}
                onFindShop={() => setShopFinderAlert(alert)}
                themeStyles={themeStyles}
              />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>다가오는 항목</Text>
        </View>
        <View style={styles.headerActions}>
          <Text style={styles.pill}>{upcomingAlerts.length}개 항목</Text>
          {hasMoreAlerts ? (
            <Pressable
              accessibilityLabel={showAllAlerts ? "다가오는 항목 접기" : "다가오는 항목 전체보기"}
              accessibilityRole="button"
              style={styles.viewAllButton}
              onPress={() => setShowAllAlerts((current) => !current)}
            >
              <Text style={styles.viewAllIcon}>{showAllAlerts ? "⌃" : "☰"}</Text>
              <Text style={styles.viewAllText}>{showAllAlerts ? "접기" : "전체보기"}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.listGap}>
        {visibleAlerts.map((alert) => (
          <AlertCard
            key={alert.id}
            alert={alert}
            onRecordMaintenance={() => onAddMaintenance(alert)}
            onFindShop={() => setShopFinderAlert(alert)}
            themeStyles={themeStyles}
          />
        ))}
        {!visibleAlerts.length ? (
          <EmptyState title="다가오는 항목이 없습니다" copy="주의 항목을 기록하거나 정비주기를 추가하면 다음 알림이 계산됩니다." themeStyles={themeStyles} />
        ) : null}
      </View>

      {recentMaintenance ? (
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>최근 정비</Text>
          <RecordCard
            title={`${recentMaintenance.title} ${formatKm(recentMaintenance.odometerKm)} · ${recentMaintenance.shop} · ${formatKrw(recentMaintenance.costKrw)}`}
            subtitle={recentMaintenance.date}
            detail={recentMaintenance.memo}
            amount=""
            themeStyles={themeStyles}
          />
        </View>
      ) : null}

      {data.bike ? (
        <PartnerShopFinderModal
          visible={Boolean(shopFinderAlert)}
          bike={data.bike}
          schedule={shopFinderAlert}
          shops={partnerShops}
          themeStyles={themeStyles}
          onClose={() => setShopFinderAlert(null)}
        />
      ) : null}
    </View>
  );
}

function MetricCard({
  label,
  value,
  accent,
  themeStyles
}: {
  label: string;
  value: string;
  accent: string;
  themeStyles: ThemeStyles;
}) {
  return (
    <View style={[styles.metricCard, themeStyles.metricCard]}>
      <View style={[styles.metricAccent, { backgroundColor: accent }]} />
      <Text style={[styles.metricLabel, themeStyles.metricLabel]}>{label}</Text>
      <Text style={[styles.metricValue, themeStyles.metricValue]}>{value}</Text>
    </View>
  );
}

function AlertCard({
  alert,
  onRecordMaintenance,
  onDeleteAlert,
  onFindShop,
  themeStyles
}: {
  alert: MaintenanceAlert;
  onRecordMaintenance?: () => void;
  onDeleteAlert?: () => void;
  onFindShop?: () => void;
  themeStyles: ThemeStyles;
}) {
  const label = "기록";
  const dueText =
    alert.dueInKm <= 0 ? `${formatKm(Math.abs(alert.dueInKm))} 지남` : `${formatKm(alert.dueInKm)} 남음`;
  const lastServiceText = alert.lastServiceKm ? `마지막 정비 ${formatKm(alert.lastServiceKm)}` : "정비 기록 없음";
  const referenceText = displayScheduleMemo(alert.memo);

  return (
    <View style={[styles.alertCard, themeStyles.alertCard]}>
      <View style={styles.alertTitleRow}>
        <View style={styles.alertTextBlock}>
          <Text style={[styles.cardTitle, themeStyles.cardTitle, styles.alertTitleText]}>
            {alert.title} <Text style={[styles.alertDue, themeStyles.alertDue]}>{dueText}</Text>
          </Text>
          {referenceText ? (
            <Text style={[styles.cardDetail, themeStyles.cardDetail, styles.alertReferenceText]}>{referenceText}</Text>
          ) : null}
        </View>
        <View style={styles.alertActionRow}>
          {onDeleteAlert ? (
            <Pressable
              accessibilityLabel={`${alert.title} 삭제`}
              accessibilityRole="button"
              style={[styles.alertDeleteButton, themeStyles.alertDeleteButton]}
              onPress={onDeleteAlert}
            >
              <Text style={[styles.alertDeleteButtonText, themeStyles.alertDeleteButtonText]}>삭제</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel={`${alert.title} 정비 기록 추가`}
            accessibilityRole="button"
            style={[
              styles.alertStatusButton,
              themeStyles.alertStatusButton,
              alert.status === "overdue" && styles.statusOverdueButton,
              alert.status === "soon" && styles.statusSoonButton
            ]}
            onPress={onRecordMaintenance}
          >
            <Text
              style={[
                styles.alertStatusText,
                themeStyles.alertStatusText,
                alert.status === "overdue" && styles.statusOverdueText,
                alert.status === "soon" && styles.statusSoonText
              ]}
            >
              {label}
            </Text>
          </Pressable>
          {onFindShop ? (
            <Pressable
              accessibilityLabel={`${alert.title} 정비소 찾기`}
              accessibilityRole="button"
              style={[styles.findShopButton, themeStyles.findShopButton]}
              onPress={onFindShop}
            >
              <Text style={[styles.findShopButtonText, themeStyles.findShopButtonText]}>정비소 찾기</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      <Text style={[styles.cardDetail, themeStyles.cardDetail, styles.alertServiceText]}>{lastServiceText}</Text>
    </View>
  );
}

function MaintenanceScreen({
  bike,
  maintenanceRecords,
  schedules,
  onAddMaintenance,
  onEditMaintenance,
  onDeleteMaintenance,
  onAddSchedule,
  onEditSchedule,
  onResetModelSchedules,
  themeStyles
}: {
  bike: BikeProfile;
  maintenanceRecords: MaintenanceRecord[];
  schedules: ScheduleItem[];
  onAddMaintenance: () => void;
  onEditMaintenance: (record: MaintenanceRecord) => void;
  onDeleteMaintenance: (record: MaintenanceRecord) => void;
  onAddSchedule: () => void;
  onEditSchedule: (schedule: ScheduleItem) => void;
  onResetModelSchedules: () => void;
  themeStyles: ThemeStyles;
}) {
  const scheduleSource = scheduleSourceForBike(bike);

  return (
    <View style={styles.screenBlock}>
      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>기록장</Text>
          </View>
          <Pressable style={styles.iconButtonDark} onPress={onAddMaintenance}>
            <Text style={styles.iconButtonDarkText}>추가</Text>
          </Pressable>
        </View>

        <View style={styles.listGap}>
          {maintenanceRecords.map((record) => (
            <RecordCard
              key={record.id}
              title={`${record.title} ${formatKm(record.odometerKm)}`}
              subtitle={record.date}
              shop={record.shop}
              detail={record.memo}
              amount={formatKrw(record.costKrw)}
              onEdit={() => onEditMaintenance(record)}
              onDelete={() => onDeleteMaintenance(record)}
              themeStyles={themeStyles}
            />
          ))}
          {!maintenanceRecords.length ? (
            <EmptyState title="아직 정비 기록이 없습니다" copy="정비를 마치면 기록을 추가해보세요." themeStyles={themeStyles} />
          ) : null}
        </View>
      </View>

      <MaintenanceScheduleManager
        schedules={schedules}
        scheduleSource={scheduleSource}
        onAddSchedule={onAddSchedule}
        onEditSchedule={onEditSchedule}
        onResetModelSchedules={onResetModelSchedules}
        themeStyles={themeStyles}
      />
    </View>
  );
}

function MaintenanceScheduleManager({
  schedules,
  scheduleSource,
  onAddSchedule,
  onEditSchedule,
  onResetModelSchedules,
  themeStyles
}: {
  schedules: ScheduleItem[];
  scheduleSource: string;
  onAddSchedule: () => void;
  onEditSchedule: (schedule: ScheduleItem) => void;
  onResetModelSchedules: () => void;
  themeStyles: ThemeStyles;
}) {
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View style={styles.flex}>
          <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>전체 정비주기</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.iconButton} onPress={onResetModelSchedules}>
            <Text style={styles.iconButtonText}>모델 적용</Text>
          </Pressable>
          <Pressable style={styles.iconButtonDark} onPress={onAddSchedule}>
            <Text style={styles.iconButtonDarkText}>추가</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[styles.mutedText, themeStyles.mutedText]}>
        적용 템플릿: {scheduleSource}. 소모품 교환과 제동, 조향, 서스펜션, 전기, 냉각 계통 점검 주기를 함께
        확인하고 수정할 수 있습니다.
      </Text>
      <View style={styles.listGap}>
        {schedules.map((schedule) => (
          <ScheduleCard
            key={schedule.id}
            schedule={schedule}
            onEdit={() => onEditSchedule(schedule)}
            themeStyles={themeStyles}
          />
        ))}
        {!schedules.length ? (
          <EmptyState title="정비주기가 없습니다" copy="모델 적용을 누르거나 직접 주기를 추가해보세요." themeStyles={themeStyles} />
        ) : null}
      </View>
    </View>
  );
}

function ScheduleCard({
  schedule,
  onEdit,
  themeStyles
}: {
  schedule: ScheduleItem;
  onEdit: () => void;
  themeStyles: ThemeStyles;
}) {
  return (
    <View style={[styles.recordCard, themeStyles.recordCard]}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, themeStyles.cardTitle]}>{schedule.title}</Text>
          <Text style={[styles.cardSubtitle, themeStyles.cardSubtitle]}>
            {schedule.category} · {formatKm(schedule.intervalKm)}마다
          </Text>
        </View>
        <Pressable style={styles.iconButton} onPress={onEdit}>
          <Text style={styles.iconButtonText}>수정</Text>
        </Pressable>
      </View>
      {schedule.memo ? <Text style={[styles.cardDetail, themeStyles.cardDetail]}>{displayScheduleMemo(schedule.memo)}</Text> : null}
    </View>
  );
}

function shopMatchesContext(shop: PartnerShop, bike: BikeProfile, schedule?: ScheduleItem | null) {
  const brandMatched =
    !shop.brands.length ||
    shop.brands.includes("*") ||
    shop.brands.some((brand) => catalogKey(brand) === catalogKey(bike.manufacturer));
  const categoryMatched =
    !schedule ||
    !shop.categories.length ||
    shop.categories.includes("*") ||
    shop.categories.some((category) => catalogKey(category) === catalogKey(schedule.category));
  return brandMatched && categoryMatched;
}

function PartnerShopFinderModal({
  visible,
  bike,
  schedule,
  shops,
  themeStyles,
  onClose
}: {
  visible: boolean;
  bike: BikeProfile;
  schedule: ScheduleItem | null;
  shops: PartnerShop[];
  themeStyles: ThemeStyles;
  onClose: () => void;
}) {
  const matchedShops = shops.filter((shop) => shopMatchesContext(shop, bike, schedule));
  const searchLabel = schedule ? schedule.title : `${bike.manufacturer} ${bike.model}`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <SafeAreaView style={[styles.modalSafeArea, themeStyles.modalSafeArea]}>
        <View style={[styles.modalHeader, themeStyles.modalHeader]}>
          <Pressable onPress={onClose} style={styles.modalTextButton}>
            <Text style={styles.modalTextButtonLabel}>닫기</Text>
          </Pressable>
          <Text style={[styles.modalTitle, themeStyles.modalTitle]}>협력 정비소</Text>
          <View style={styles.modalTextButton} />
        </View>
        <ScrollView contentContainerStyle={styles.formContent}>
          <View style={[styles.partnerFinderHero, themeStyles.recordCard]}>
            <Text style={styles.cardEyebrow}>정비 항목</Text>
            <Text style={[styles.cardTitle, themeStyles.cardTitle]}>{searchLabel}</Text>
            <Text style={[styles.cardDetail, themeStyles.cardDetail]}>
              {bike.manufacturer} {bike.model}
            </Text>
            <Pressable style={styles.secondaryButtonWide} onPress={() => openExternalUrl(mapSearchUrl(bike, schedule))}>
              <Text style={styles.secondaryButtonText}>지도에서 근처 정비소 검색</Text>
            </Pressable>
          </View>

          <View style={styles.sectionBlock}>
            <Text style={styles.sectionEyebrow}>협력 업체</Text>
            <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>추천 정비소</Text>
            <View style={styles.listGap}>
              {matchedShops.map((shop) => (
                <PartnerShopCard key={shop.id} shop={shop} themeStyles={themeStyles} />
              ))}
              {!matchedShops.length ? (
                <EmptyState title="등록된 협력 정비소가 없습니다" copy="지도 검색으로 근처 정비소를 확인하세요." themeStyles={themeStyles} />
              ) : null}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PartnerShopCard({
  shop,
  themeStyles
}: {
  shop: PartnerShop;
  themeStyles: ThemeStyles;
}) {
  const phoneUrl = `tel:${shop.phone.replace(/[^0-9+]/g, "")}`;
  const directionsUrl = shop.mapUrl || mapSearchByTextUrl(shop.address);

  return (
    <View style={[styles.partnerShopCard, themeStyles.recordCard]}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, themeStyles.cardTitle]}>{shop.name}</Text>
          <Text style={[styles.cardSubtitle, themeStyles.cardSubtitle]}>
            {shop.region} · {shop.phone}
          </Text>
        </View>
        <Text style={[styles.statusPill, themeStyles.statusPill]}>협력</Text>
      </View>
      <Text style={[styles.cardDetail, themeStyles.cardDetail]}>{shop.address}</Text>
      <View style={styles.partnerTagRow}>
        {shop.specialties.slice(0, 4).map((specialty) => (
          <Text key={specialty} style={[styles.partnerTag, themeStyles.statusPill]}>
            {specialty}
          </Text>
        ))}
      </View>
      <View style={styles.cloudButtonRow}>
        <Pressable style={styles.primaryButtonSmall} onPress={() => openExternalUrl(phoneUrl)}>
          <Text style={styles.primaryButtonText}>전화</Text>
        </Pressable>
        <Pressable style={styles.secondaryButtonSmall} onPress={() => openExternalUrl(directionsUrl)}>
          <Text style={styles.secondaryButtonText}>길찾기</Text>
        </Pressable>
        {shop.kakaoUrl ? (
          <Pressable style={styles.secondaryButtonSmall} onPress={() => openExternalUrl(shop.kakaoUrl!)}>
            <Text style={styles.secondaryButtonText}>상담</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function FuelScreen({
  records,
  onAddFuel,
  onEditFuel,
  onDeleteFuel,
  themeStyles
}: {
  records: FuelRecord[];
  onAddFuel: () => void;
  onEditFuel: (record: FuelRecord) => void;
  onDeleteFuel: (record: FuelRecord) => void;
  themeStyles: ThemeStyles;
}) {
  const totalCost = records.reduce((sum, record) => sum + record.costKrw, 0);
  const totalLiters = records.reduce((sum, record) => sum + record.liters, 0);

  return (
    <View style={styles.screenBlock}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, themeStyles.sectionTitle]}>누적 {totalLiters.toFixed(1)} L</Text>
        </View>
        <Pressable style={styles.iconButtonDark} onPress={onAddFuel}>
          <Text style={styles.iconButtonDarkText}>추가</Text>
        </Pressable>
      </View>
      <Text style={[styles.mutedText, themeStyles.mutedText]}>총 주유비 {formatKrw(totalCost)}</Text>
      <View style={styles.listGap}>
        {records.map((record) => (
          <RecordCard
            key={record.id}
            title={`${record.station} ${formatKm(record.odometerKm)}`}
            subtitle={record.date}
            shop={`${record.liters.toFixed(1)} L`}
            detail={record.memo}
            amount={formatKrw(record.costKrw)}
            onEdit={() => onEditFuel(record)}
            onDelete={() => onDeleteFuel(record)}
            themeStyles={themeStyles}
          />
        ))}
        {!records.length ? (
          <EmptyState title="주유 기록이 없습니다" copy="주유할 때마다 키로수와 비용을 남길 수 있습니다." themeStyles={themeStyles} />
        ) : null}
      </View>
    </View>
  );
}

function HandoverScreen({
  data,
  handoverSession,
  transferText,
  importText,
  handoverStatus,
  onGenerateTransfer,
  onChangeImportText,
  onImportTransfer,
  onApproveTransfer,
  themeStyles = makeThemeStyles("light", "normal")
}: {
  data: AppData;
  handoverSession: HandoverSession | null;
  transferText: string;
  importText: string;
  handoverStatus: string;
  onGenerateTransfer: () => Promise<void>;
  onChangeImportText: (value: string) => void;
  onImportTransfer: () => Promise<void>;
  onApproveTransfer: () => void;
  themeStyles: ThemeStyles;
}) {
  const bike = data.bike;
  const currentOdometerKm = latestOdometerFromData(data);
  const sellerCode = transferText || (handoverSession?.role === "seller" ? handoverSession.code : "");
  const canApprove = handoverSession?.role === "seller" && handoverSession.status === "buyer_requested";
  const importButtonText =
    handoverSession?.role === "buyer" && handoverSession.status === "buyer_requested"
      ? "승인 확인 후 가져오기"
      : "인계 요청 보내기";

  return (
    <View style={styles.screenBlock}>
      <View style={[styles.darkPanel, themeStyles.handoverPanel]}>
        <View>
          <Text style={[styles.darkTitle, themeStyles.handoverTitle]}>12자리 인계 코드</Text>
          <Text style={[styles.darkCopy, themeStyles.handoverCopy]}>
            구매자가 코드를 입력하면 판매자에게 승인 요청이 가고, 판매자가 승인한 뒤에만 바이크 기본정보와 정비 이력을 이어받습니다.
          </Text>
          <Text style={[styles.handoverExpireText, themeStyles.handoverCopy]}>
            48시간 동안 인계가 완료되지 않으면 클라우드에 올라간 인계 데이터는 삭제됩니다.
          </Text>
          <View style={styles.transferStats}>
            <TransferStat label="바이크 정보" value={bike ? "포함" : "없음"} themeStyles={themeStyles} />
            <TransferStat label="정비" value={`${data.maintenanceRecords.length}건`} themeStyles={themeStyles} />
            <TransferStat label="주행거리" value={formatKm(currentOdometerKm)} themeStyles={themeStyles} />
          </View>
          <Pressable style={[styles.primaryButton, styles.handoverGenerateButton]} onPress={onGenerateTransfer}>
            <Text style={styles.primaryButtonText}>12자리 코드 생성</Text>
          </Pressable>
        </View>

        {sellerCode ? (
          <View style={[styles.handoverInlineCodeCard, themeStyles.handoverInlineCodeCard]}>
            <Text style={[styles.darkEyebrow, themeStyles.handoverEyebrow]}>판매자 인계 코드</Text>
            <Text style={[styles.handoverCodeText, themeStyles.handoverPanelCodeText]}>{formatHandoverCode(sellerCode)}</Text>
            <Text style={[styles.handoverStatusText, themeStyles.handoverStatusText]}>
              {handoverStatus || handoverFlowStatusText(handoverSession?.status)}
            </Text>
            {canApprove ? (
              <Pressable style={styles.handoverApproveButton} onPress={onApproveTransfer}>
                <Text style={styles.primaryButtonText}>인계 승인</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <View style={[styles.handoverDivider, themeStyles.handoverDivider]} />

        <View>
          <Text style={[styles.darkEyebrow, themeStyles.handoverEyebrow]}>가져오기</Text>
          <Text style={[styles.handoverImportTitle, themeStyles.handoverImportTitle]}>구매자 인계 수락</Text>
          <Text style={[styles.handoverStatusText, themeStyles.handoverStatusText]}>
            코드를 입력하면 먼저 판매자에게 승인 요청을 보냅니다.
          </Text>
          <TextInput
            value={formatHandoverCode(importText)}
            onChangeText={(value) => onChangeImportText(normalizeHandoverCode(value))}
            placeholder="12자리 인계 코드"
            keyboardType="number-pad"
            maxLength={14}
            style={[styles.input, themeStyles.handoverPanelInput, styles.handoverCodeInput, styles.handoverBuyerCodeInput]}
            placeholderTextColor="#7A8796"
          />
          <Pressable style={styles.handoverImportButton} onPress={onImportTransfer}>
            <Text style={styles.primaryButtonText}>{importButtonText}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TransferStat({ label, value, themeStyles }: { label: string; value: string; themeStyles: ThemeStyles }) {
  return (
    <View style={[styles.transferStat, themeStyles.transferStat]}>
      <Text style={[styles.transferStatValue, themeStyles.transferStatValue]}>{value}</Text>
      <Text style={[styles.transferStatLabel, themeStyles.transferStatLabel]}>{label}</Text>
    </View>
  );
}

function PreferenceChoice<T extends string>({
  value,
  label,
  active,
  onPress,
  themeStyles
}: {
  value: T;
  label: string;
  active: boolean;
  onPress: (value: T) => void;
  themeStyles: ThemeStyles;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        styles.preferenceButton,
        themeStyles.preferenceButton,
        active && styles.preferenceButtonActive,
        active && themeStyles.preferenceButtonActive
      ]}
      onPress={() => onPress(value)}
    >
      <Text
        style={[
          styles.preferenceButtonText,
          themeStyles.preferenceButtonText,
          active && styles.preferenceButtonTextActive,
          active && themeStyles.preferenceButtonTextActive
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function SettingsScreen({
  handoverData,
  handoverSession,
  transferText,
  importText,
  handoverStatus,
  onGenerateTransfer,
  onChangeImportText,
  onImportTransfer,
  onApproveTransfer,
  preferences,
  onChangePreferences,
  themeStyles
}: {
  handoverData: AppData;
  handoverSession: HandoverSession | null;
  transferText: string;
  importText: string;
  handoverStatus: string;
  onGenerateTransfer: () => Promise<void>;
  onChangeImportText: (value: string) => void;
  onImportTransfer: () => Promise<void>;
  onApproveTransfer: () => void;
  preferences: AppPreferences;
  onChangePreferences: (patch: Partial<AppPreferences>) => void;
  themeStyles: ThemeStyles;
}) {
  return (
    <View style={styles.screenBlock}>
      <View style={[styles.preferencePanel, themeStyles.preferencePanel]}>
        <View style={styles.preferenceGroup}>
          <Text style={[styles.cardTitle, themeStyles.cardTitle]}>테마</Text>
          <View style={styles.preferenceChoices}>
            <PreferenceChoice
              value="light"
              label="밝은테마"
              active={preferences.themeMode === "light"}
              onPress={(themeMode) => onChangePreferences({ themeMode })}
              themeStyles={themeStyles}
            />
            <PreferenceChoice
              value="dark"
              label="어두운테마"
              active={preferences.themeMode === "dark"}
              onPress={(themeMode) => onChangePreferences({ themeMode })}
              themeStyles={themeStyles}
            />
          </View>
        </View>
        <View style={styles.preferenceGroup}>
          <Text style={[styles.cardTitle, themeStyles.cardTitle]}>글자 크기</Text>
          <View style={styles.preferenceChoices}>
            <PreferenceChoice
              value="small"
              label="작게"
              active={preferences.textSizeMode === "small"}
              onPress={(textSizeMode) => onChangePreferences({ textSizeMode })}
              themeStyles={themeStyles}
            />
            <PreferenceChoice
              value="normal"
              label="보통"
              active={preferences.textSizeMode === "normal"}
              onPress={(textSizeMode) => onChangePreferences({ textSizeMode })}
              themeStyles={themeStyles}
            />
            <PreferenceChoice
              value="large"
              label="크게"
              active={preferences.textSizeMode === "large"}
              onPress={(textSizeMode) => onChangePreferences({ textSizeMode })}
              themeStyles={themeStyles}
            />
          </View>
        </View>
      </View>

      <HandoverScreen
        data={handoverData}
        handoverSession={handoverSession}
        transferText={transferText}
        importText={importText}
        handoverStatus={handoverStatus}
        onGenerateTransfer={onGenerateTransfer}
        onChangeImportText={onChangeImportText}
        onImportTransfer={onImportTransfer}
        onApproveTransfer={onApproveTransfer}
        themeStyles={themeStyles}
      />

    </View>
  );
}

function RecordCard({
  title,
  subtitle,
  shop,
  detail,
  amount,
  onEdit,
  onDelete,
  themeStyles = makeThemeStyles("light", "normal")
}: {
  title: string;
  subtitle: string;
  shop?: string;
  detail: string;
  amount: string;
  onEdit?: () => void;
  onDelete?: () => void;
  themeStyles?: ThemeStyles;
}) {
  const hasActions = Boolean(onEdit || onDelete);
  const hasStandaloneAmount = Boolean(amount && !shop);

  return (
    <View style={[styles.recordCard, themeStyles.recordCard]}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <View style={styles.recordTitleMetaRow}>
            <Text style={[styles.cardTitle, themeStyles.cardTitle, styles.recordTitleText]}>{title}</Text>
            <Text style={[styles.cardSubtitle, themeStyles.cardSubtitle, styles.recordSubtitleText]}>{subtitle}</Text>
          </View>
          {shop ? (
            <View style={styles.recordShopAmountRow}>
              <Text style={[styles.cardSubtitle, themeStyles.cardSubtitle, styles.recordShopText]}>{shop}</Text>
              <Text style={[styles.amountText, themeStyles.amountText]}>{amount}</Text>
            </View>
          ) : null}
        </View>
        {hasActions || hasStandaloneAmount ? (
          <View style={styles.recordActions}>
            {hasStandaloneAmount ? <Text style={[styles.amountText, themeStyles.amountText]}>{amount}</Text> : null}
            <View style={styles.recordActionButtonRow}>
              {onEdit ? (
                <Pressable accessibilityLabel={`${title} 수정`} style={styles.recordEditButton} onPress={onEdit}>
                  <Text style={styles.recordEditText}>수정</Text>
                </Pressable>
              ) : null}
              {onDelete ? (
                <Pressable accessibilityLabel={`${title} 삭제`} style={styles.recordDeleteButton} onPress={onDelete}>
              <Text style={styles.recordDeleteText}>삭제</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
      {detail ? <Text style={[styles.cardDetail, themeStyles.cardDetail]}>{detail}</Text> : null}
    </View>
  );
}

function EmptyState({
  title,
  copy,
  themeStyles = makeThemeStyles("light", "normal")
}: {
  title: string;
  copy: string;
  themeStyles?: ThemeStyles;
}) {
  return (
    <View style={[styles.emptyState, themeStyles.emptyState]}>
      <Text style={[styles.emptyTitle, themeStyles.emptyTitle]}>{title}</Text>
      <Text style={[styles.emptyCopy, themeStyles.emptyCopy]}>{copy}</Text>
    </View>
  );
}

function MaintenanceModal({
  visible,
  latestOdometer,
  initialSchedule,
  initialRecord,
  defaultShop,
  themeStyles,
  onClose,
  onSubmit
}: {
  visible: boolean;
  latestOdometer: number;
  initialSchedule?: Pick<ScheduleItem, "title" | "category" | "memo"> | null;
  initialRecord?: MaintenanceRecord | null;
  defaultShop: string;
  themeStyles: ThemeStyles;
  onClose: () => void;
  onSubmit: (record: MaintenanceRecord) => void;
}) {
  const [form, setForm] = useState<MaintenanceForm>({
    date: todayIso(),
    odometerKm: String(latestOdometer),
    category: "기타",
    title: "",
    shop: defaultShop,
    costKrw: "",
    memo: ""
  });

  useEffect(() => {
    if (visible) {
      setForm({
        date: initialRecord?.date ?? todayIso(),
        odometerKm: String(initialRecord?.odometerKm ?? latestOdometer),
        category: initialRecord?.category ?? initialSchedule?.category ?? "기타",
        title: initialRecord?.title ?? initialSchedule?.title ?? "",
        shop: initialRecord?.shop ?? defaultShop,
        costKrw: initialRecord ? String(initialRecord.costKrw) : "",
        memo: initialRecord?.memo ?? ""
      });
    }
  }, [defaultShop, initialRecord, initialSchedule, latestOdometer, visible]);

  const update = (key: keyof MaintenanceForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const odometerKm = numberOnly(form.odometerKm);
    if (!form.title.trim() || odometerKm <= 0) {
      Alert.alert("정비 기록", "정비명과 주행거리를 입력해주세요.");
      return;
    }
    onSubmit({
      id: initialRecord?.id ?? newId("maint"),
      bikeId: initialRecord?.bikeId,
      date: sanitizeIsoDate(form.date.trim() || todayIso()),
      odometerKm,
      category: initialSchedule?.category ?? inferMaintenanceCategory(form.title, form.category),
      title: form.title.trim(),
      shop: form.shop.trim() || "직접 기록",
      costKrw: numberOnly(form.costKrw),
      memo: form.memo.trim()
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <FormScaffold title={initialRecord ? "정비 기록 수정" : "정비 기록 추가"} onClose={onClose} onSubmit={submit} themeStyles={themeStyles}>
        <TextInput value={form.title} onChangeText={(v) => update("title", v)} placeholder="정비명" style={[styles.input, themeStyles.input]} placeholderTextColor="#8792A0" />
        <View style={styles.twoColumn}>
          <TextInput value={form.date} onChangeText={(v) => update("date", v)} placeholder="날짜" style={[styles.input, themeStyles.input, styles.flex]} placeholderTextColor="#8792A0" />
          <TextInput value={form.odometerKm} onChangeText={(v) => update("odometerKm", v)} placeholder="주행거리 km" keyboardType="number-pad" style={[styles.input, themeStyles.input, styles.flex]} placeholderTextColor="#8792A0" />
        </View>
        <TextInput value={form.shop} onChangeText={(v) => update("shop", v)} placeholder="정비소" style={[styles.input, themeStyles.input]} placeholderTextColor="#8792A0" />
        <TextInput value={form.costKrw} onChangeText={(v) => update("costKrw", v)} placeholder="비용" keyboardType="number-pad" style={[styles.input, themeStyles.input]} placeholderTextColor="#8792A0" />
        <TextInput value={form.memo} onChangeText={(v) => update("memo", v)} placeholder="메모" multiline style={[styles.input, themeStyles.input, styles.memoInput]} placeholderTextColor="#8792A0" />
      </FormScaffold>
    </Modal>
  );
}

function FuelModal({
  visible,
  latestOdometer,
  initialRecord,
  defaultStation,
  themeStyles,
  onClose,
  onSubmit
}: {
  visible: boolean;
  latestOdometer: number;
  initialRecord?: FuelRecord | null;
  defaultStation: string;
  themeStyles: ThemeStyles;
  onClose: () => void;
  onSubmit: (record: FuelRecord) => void;
}) {
  const [form, setForm] = useState<FuelForm>({
    date: todayIso(),
    odometerKm: String(latestOdometer),
    station: "",
    liters: "",
    costKrw: "",
    memo: ""
  });

  useEffect(() => {
    if (visible) {
      setForm({
        date: initialRecord?.date ?? todayIso(),
        odometerKm: String(initialRecord?.odometerKm ?? latestOdometer),
        station: initialRecord?.station ?? defaultStation,
        liters: initialRecord ? String(initialRecord.liters) : "",
        costKrw: initialRecord ? String(initialRecord.costKrw) : "",
        memo: initialRecord?.memo ?? ""
      });
    }
  }, [defaultStation, initialRecord, latestOdometer, visible]);

  const update = (key: keyof FuelForm, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const odometerKm = numberOnly(form.odometerKm);
    if (odometerKm <= 0) {
      Alert.alert("주유 기록", "주행거리를 입력해주세요.");
      return;
    }
    onSubmit({
      id: initialRecord?.id ?? newId("fuel"),
      bikeId: initialRecord?.bikeId,
      date: sanitizeIsoDate(form.date.trim() || todayIso()),
      odometerKm,
      station: form.station.trim() || "주유 기록",
      liters: numberOnly(form.liters),
      costKrw: numberOnly(form.costKrw),
      memo: form.memo.trim()
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <FormScaffold title={initialRecord ? "주유 기록 수정" : "주유 기록 추가"} onClose={onClose} onSubmit={submit} themeStyles={themeStyles}>
        <TextInput value={form.station} onChangeText={(v) => update("station", v)} placeholder="주유소명 선택" style={[styles.input, themeStyles.input]} placeholderTextColor="#8792A0" />
        <View style={styles.twoColumn}>
          <TextInput value={form.date} onChangeText={(v) => update("date", v)} placeholder="날짜" style={[styles.input, themeStyles.input, styles.flex]} placeholderTextColor="#8792A0" />
          <TextInput value={form.odometerKm} onChangeText={(v) => update("odometerKm", v)} placeholder="주행거리 km" keyboardType="number-pad" style={[styles.input, themeStyles.input, styles.flex]} placeholderTextColor="#8792A0" />
        </View>
        <View style={styles.twoColumn}>
          <TextInput value={form.liters} onChangeText={(v) => update("liters", v)} placeholder="리터" keyboardType="decimal-pad" style={[styles.input, themeStyles.input, styles.flex]} placeholderTextColor="#8792A0" />
          <TextInput value={form.costKrw} onChangeText={(v) => update("costKrw", v)} placeholder="비용" keyboardType="number-pad" style={[styles.input, themeStyles.input, styles.flex]} placeholderTextColor="#8792A0" />
        </View>
        <TextInput value={form.memo} onChangeText={(v) => update("memo", v)} placeholder="메모 선택" multiline style={[styles.input, themeStyles.input, styles.memoInput]} placeholderTextColor="#8792A0" />
      </FormScaffold>
    </Modal>
  );
}

function OdometerModal({
  visible,
  latestOdometer,
  themeStyles,
  onClose,
  onSubmit
}: {
  visible: boolean;
  latestOdometer: number;
  themeStyles: ThemeStyles;
  onClose: () => void;
  onSubmit: (record: OdometerRecord) => void;
}) {
  const [odometerKm, setOdometerKm] = useState(String(latestOdometer));
  const [memo, setMemo] = useState("");

  useEffect(() => {
    if (visible) {
      setOdometerKm(String(latestOdometer));
      setMemo("");
    }
  }, [latestOdometer, visible]);

  const submit = () => {
    const nextOdometer = numberOnly(odometerKm);
    if (nextOdometer <= 0) {
      Alert.alert("키로수 입력", "주행거리를 입력해주세요.");
      return;
    }
    onSubmit({
      id: newId("odo"),
      date: todayIso(),
      odometerKm: nextOdometer,
      memo: memo.trim() || "월간 알림에 따라 현재 키로수를 입력했습니다."
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <FormScaffold title="현재 키로수 입력" onClose={onClose} onSubmit={submit} themeStyles={themeStyles}>
        <View style={[styles.infoPanel, themeStyles.infoPanel]}>
          <Text style={[styles.cardTitle, themeStyles.cardTitle]}>30일 알림용 주행거리 확인</Text>
          <Text style={[styles.cardDetail, themeStyles.cardDetail]}>정비나 주유 기록이 없어도 이 값으로 다음 정비 알림을 다시 계산합니다.</Text>
          <Text style={[styles.mutedStrong, themeStyles.mutedStrong]}>마지막 기록 {formatKm(latestOdometer)}</Text>
        </View>
        <TextInput value={odometerKm} onChangeText={setOdometerKm} placeholder="현재 주행거리 km" keyboardType="number-pad" style={[styles.input, themeStyles.input]} placeholderTextColor="#8792A0" />
        <TextInput value={memo} onChangeText={setMemo} placeholder="메모" multiline style={[styles.input, themeStyles.input, styles.memoInput]} placeholderTextColor="#8792A0" />
      </FormScaffold>
    </Modal>
  );
}

function ScheduleModal({
  visible,
  initialSchedule,
  themeStyles,
  onClose,
  onSubmit
}: {
  visible: boolean;
  initialSchedule?: ScheduleItem | null;
  themeStyles: ThemeStyles;
  onClose: () => void;
  onSubmit: (schedule: ScheduleItem) => void;
}) {
  const [form, setForm] = useState<ScheduleForm>({
    title: "",
    category: "점검",
    intervalKm: "",
    warningKm: "",
    memo: ""
  });

  useEffect(() => {
    if (visible) {
      setForm({
        title: initialSchedule?.title ?? "",
        category: initialSchedule?.category ?? "점검",
        intervalKm: initialSchedule ? String(initialSchedule.intervalKm) : "",
        warningKm: initialSchedule ? String(initialSchedule.warningKm) : "",
        memo: initialSchedule?.memo ?? ""
      });
    }
  }, [initialSchedule, visible]);

  const update = (key: keyof ScheduleForm, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const intervalKm = numberOnly(form.intervalKm);
    if (!form.title.trim() || intervalKm <= 0) {
      Alert.alert("정비주기", "항목명과 정비 주기를 입력해주세요.");
      return;
    }
    onSubmit({
      id: initialSchedule?.id ?? newId("schedule"),
      bikeId: initialSchedule?.bikeId,
      title: form.title.trim(),
      category: form.category,
      intervalKm,
      warningKm: numberOnly(form.warningKm) || Math.min(1000, Math.floor(intervalKm * 0.2)),
      memo: form.memo.trim() || "사용자 기준으로 직접 추가한 항목입니다."
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <FormScaffold title={initialSchedule ? "정비주기 수정" : "정비주기 추가"} onClose={onClose} onSubmit={submit} themeStyles={themeStyles}>
        <TextInput value={form.title} onChangeText={(v) => update("title", v)} placeholder="항목명" style={[styles.input, themeStyles.input]} placeholderTextColor="#8792A0" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {categories.map((category) => (
            <Pressable
              key={category}
              style={[styles.chip, themeStyles.chip, form.category === category && styles.activeChip]}
              onPress={() => update("category", category)}
            >
              <Text style={[styles.chipText, themeStyles.chipText, form.category === category && styles.activeChipText]}>{category}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput value={form.intervalKm} onChangeText={(v) => update("intervalKm", v)} placeholder="주기 km" keyboardType="number-pad" style={[styles.input, themeStyles.input]} placeholderTextColor="#8792A0" />
        <TextInput value={form.memo} onChangeText={(v) => update("memo", v)} placeholder="메모" multiline style={[styles.input, themeStyles.input, styles.memoInput]} placeholderTextColor="#8792A0" />
      </FormScaffold>
    </Modal>
  );
}

function FormScaffold({
  title,
  children,
  onClose,
  onSubmit,
  themeStyles
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  themeStyles: ThemeStyles;
}) {
  return (
    <SafeAreaView style={[styles.modalSafeArea, themeStyles.modalSafeArea]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={[styles.modalHeader, themeStyles.modalHeader]}>
          <Pressable onPress={onClose} style={styles.modalTextButton}>
            <Text style={styles.modalTextButtonLabel}>닫기</Text>
          </Pressable>
          <Text style={[styles.modalTitle, themeStyles.modalTitle]}>{title}</Text>
          <Pressable onPress={onSubmit} style={styles.modalTextButton}>
            <Text style={styles.modalTextButtonLabel}>저장</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.formContent}>{children}</ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const colors = {
  background: "#F4F6F8",
  surface: "#FFFFFF",
  ink: "#18202A",
  muted: "#647181",
  border: "#DDE4EA",
  teal: "#0E7C7B",
  navy: "#1D3557",
  amber: "#C27A16",
  red: "#B84A39"
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0
  },
  flex: {
    flex: 1
  },
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    padding: 22
  },
  scrollContent: {
    padding: 18,
    paddingBottom: 36
  },
  appName: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  confirmOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(24, 32, 42, 0.45)",
    flex: 1,
    justifyContent: "center",
    padding: 18
  },
  confirmPanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 420,
    padding: 18,
    width: "100%"
  },
  confirmTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900"
  },
  confirmMessage: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8
  },
  confirmActions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 18
  },
  confirmDeleteButton: {
    alignItems: "center",
    backgroundColor: "#FCEAE7",
    borderColor: "#E2B0A7",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14
  },
  confirmDeleteText: {
    color: colors.red,
    fontSize: 13,
    fontWeight: "900"
  },
  confirmPrimaryButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14
  },
  confirmPrimaryText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  bikeSwitcher: {
    gap: 8,
    paddingBottom: 12
  },
  bikeChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minWidth: 150,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  activeBikeChip: {
    backgroundColor: "#E7FFFA",
    borderColor: colors.teal
  },
  bikeChipMain: {
    flex: 1,
    justifyContent: "center",
    minHeight: 40
  },
  bikeChipTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  activeBikeChipTitle: {
    color: colors.teal
  },
  bikeChipMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 4
  },
  activeBikeChipMeta: {
    color: colors.teal
  },
  bikeAddChip: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 8,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 14
  },
  bikeAddIcon: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900"
  },
  bikeAddText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  onboardingPanel: {
    backgroundColor: colors.ink,
    borderRadius: 8,
    padding: 18
  },
  onboardingHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  onboardingCloseButton: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  onboardingCloseText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  onboardingEyebrow: {
    color: "#A9E6DF",
    fontSize: 12,
    fontWeight: "900"
  },
  onboardingTitle: {
    color: "#FFFFFF",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 6
  },
  onboardingCopy: {
    color: "#CAD3DE",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 9
  },
  formStack: {
    gap: 12,
    marginTop: 16
  },
  formSectionLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  catalogStatus: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: -5
  },
  hero: {
    backgroundColor: colors.ink,
    borderRadius: 8,
    padding: 18
  },
  heroTopLine: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  heroOwner: {
    color: "#A9E6DF",
    flexShrink: 1,
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 36,
    marginRight: 12
  },
  heroGearButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  heroGearIcon: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900"
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 20
  },
  heroMeta: {
    color: "#D8E0E8",
    fontSize: 14,
    marginTop: 7
  },
  heroMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18
  },
  heroMetric: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minWidth: 220,
    padding: 12
  },
  heroMetricHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  heroMetricAction: {
    alignItems: "center",
    backgroundColor: "#E7FFFA",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 30,
    paddingHorizontal: 9
  },
  heroMetricActionText: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900"
  },
  metricLabelLight: {
    color: "#C8D3DF",
    fontSize: 12,
    fontWeight: "800"
  },
  metricValueLight: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 5
  },
  heroOdometerRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between"
  },
  heroOdometerDate: {
    color: "#C8D3DF",
    flexShrink: 0,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 1
  },
  heroReminderText: {
    color: "#B8F5EB",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 8
  },
  heroReminderDueText: {
    color: "#FFD978"
  },
  tabBar: {
    backgroundColor: "#E6EBF0",
    borderRadius: 8,
    gap: 5,
    marginTop: 16,
    padding: 5
  },
  tabButton: {
    alignItems: "center",
    borderRadius: 6,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 18
  },
  activeTabButton: {
    backgroundColor: colors.surface
  },
  tabText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "900"
  },
  activeTabText: {
    color: colors.ink
  },
  screenBlock: {
    marginTop: 16
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    minHeight: 104,
    padding: 14
  },
  metricAccent: {
    borderRadius: 2,
    height: 4,
    marginBottom: 12,
    width: 34
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  metricValue: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
    marginTop: 7
  },
  quickActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  overviewActionButton: {
    alignItems: "center",
    borderRadius: 8,
    flex: 1,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 14
  },
  overviewMaintenanceButton: {
    backgroundColor: colors.teal
  },
  overviewFuelButton: {
    backgroundColor: colors.ink
  },
  overviewActionIcon: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900"
  },
  overviewActionText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 14
  },
  primaryButtonSmall: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  secondaryButtonSmall: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 8,
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  secondaryButtonWide: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    marginTop: 10,
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900"
  },
  compactButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  compactButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  sectionBlock: {
    marginTop: 18
  },
  sectionBlockTight: {
    marginTop: 2
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  sectionEyebrow: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 4
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "900"
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 8
  },
  pill: {
    backgroundColor: "#EEF1F4",
    borderRadius: 999,
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  viewAllButton: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 8,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 10
  },
  viewAllIcon: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  viewAllText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900"
  },
  listGap: {
    gap: 10
  },
  alertCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  partnerFinderHero: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  partnerShopCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 14
  },
  partnerTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  partnerTag: {
    backgroundColor: "#E8F7F4",
    borderRadius: 999,
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  rowBetween: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  cardEyebrow: {
    color: colors.teal,
    fontSize: 12,
    fontWeight: "900"
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  alertTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    width: "100%"
  },
  alertTextBlock: {
    flex: 1,
    minWidth: 0
  },
  alertTitleText: {
    width: "100%"
  },
  alertReferenceText: {
    marginTop: 6
  },
  alertServiceText: {
    marginTop: 0
  },
  cardSubtitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 5
  },
  cardDetail: {
    color: "#435160",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8
  },
  statusPill: {
    backgroundColor: "#EEF3F7",
    borderRadius: 999,
    color: colors.navy,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  statusOverdue: {
    backgroundColor: "#FCEAE7",
    color: colors.red
  },
  statusSoon: {
    backgroundColor: "#FFF3D9",
    color: colors.amber
  },
  alertStatusButton: {
    alignItems: "center",
    backgroundColor: "#EEF3F7",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 58,
    paddingHorizontal: 14
  },
  alertStatusText: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: "900"
  },
  alertDeleteButton: {
    alignItems: "center",
    backgroundColor: "#FCEAE7",
    borderColor: "#E2B0A7",
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    minWidth: 58,
    paddingHorizontal: 12
  },
  alertDeleteButtonText: {
    color: colors.red,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18
  },
  statusOverdueButton: {
    backgroundColor: "#FCEAE7"
  },
  statusSoonButton: {
    backgroundColor: "#FFF3D9"
  },
  statusOverdueText: {
    color: colors.red
  },
  statusSoonText: {
    color: colors.amber
  },
  alertActionRow: {
    alignItems: "center",
    alignSelf: "flex-start",
    flexShrink: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end"
  },
  findShopButton: {
    alignItems: "center",
    backgroundColor: "#E8F7F4",
    borderColor: "#B9E4DD",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14
  },
  findShopButtonText: {
    color: colors.teal,
    fontSize: 13,
    fontWeight: "900"
  },
  alertDue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  mutedText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20
  },
  mutedStrong: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  recordCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 14
  },
  recordActions: {
    alignItems: "flex-end",
    flexShrink: 0,
    gap: 8
  },
  recordActionButtonRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end"
  },
  recordTitleMetaRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    width: "100%"
  },
  recordTitleText: {
    flex: 1,
    minWidth: 0
  },
  recordSubtitleText: {
    flexShrink: 0,
    marginTop: 0,
    textAlign: "right"
  },
  recordShopAmountRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "flex-start",
    marginTop: 5
  },
  recordShopText: {
    flexGrow: 0,
    flexShrink: 1
  },
  amountText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  recordEditButton: {
    alignItems: "center",
    backgroundColor: "#EEF3F7",
    borderColor: "#C9D5DF",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 58,
    paddingHorizontal: 12
  },
  recordEditText: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: "900"
  },
  recordDeleteButton: {
    alignItems: "center",
    backgroundColor: "#FCEAE7",
    borderColor: "#E2B0A7",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 58,
    paddingHorizontal: 12
  },
  recordDeleteText: {
    color: colors.red,
    fontSize: 13,
    fontWeight: "900"
  },
  emptyState: {
    alignItems: "center",
    backgroundColor: "#EEF3F7",
    borderColor: "#C9D5DF",
    borderRadius: 8,
    borderWidth: 1,
    padding: 18
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
    textAlign: "center"
  },
  actionRow: {
    flexDirection: "row",
    gap: 8
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: "#EEF3F7",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  iconButtonText: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: "900"
  },
  iconButtonDark: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderRadius: 8,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  iconButtonDarkText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900"
  },
  iconButtonDanger: {
    alignItems: "center",
    backgroundColor: "#FCEAE7",
    borderColor: "#E2B0A7",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 12
  },
  iconButtonDangerText: {
    color: colors.red,
    fontSize: 13,
    fontWeight: "900"
  },
  cloudButtonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  darkPanel: {
    backgroundColor: colors.ink,
    borderRadius: 8,
    gap: 0,
    padding: 18
  },
  darkEyebrow: {
    color: "#A9E6DF",
    fontSize: 12,
    fontWeight: "900"
  },
  darkTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 6
  },
  darkCopy: {
    color: "#CAD3DE",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8
  },
  handoverExpireText: {
    color: "#647181",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8
  },
  transferStats: {
    flexDirection: "row",
    gap: 9,
    marginTop: 16
  },
  transferStat: {
    backgroundColor: "rgba(255,255,255,0.11)",
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 12
  },
  transferStatValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900"
  },
  transferStatLabel: {
    color: "#BAC7D4",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4
  },
  handoverGenerateButton: {
    marginTop: 12
  },
  handoverDivider: {
    backgroundColor: "rgba(255,255,255,0.14)",
    height: 1,
    marginVertical: 18
  },
  handoverImportTitle: {
    color: "#FFFFFF",
    fontSize: 21,
    fontWeight: "900",
    marginTop: 6
  },
  handoverInlineCodeCard: {
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 14
  },
  handoverStatusText: {
    color: "#CAD3DE",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8
  },
  handoverApproveButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
    marginTop: 12,
    paddingHorizontal: 14
  },
  handoverImportButton: {
    alignItems: "center",
    backgroundColor: colors.teal,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: "center",
    marginTop: 10,
    paddingHorizontal: 14
  },
  preferencePanel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    marginTop: 18,
    padding: 14
  },
  preferenceGroup: {
    gap: 9
  },
  preferenceChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  preferenceButton: {
    alignItems: "center",
    backgroundColor: "#EEF3F7",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 92,
    paddingHorizontal: 12
  },
  preferenceButtonActive: {
    backgroundColor: "#E7FFFA",
    borderColor: colors.teal
  },
  preferenceButtonText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  preferenceButtonTextActive: {
    color: colors.teal
  },
  handoverCodeCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    marginTop: 12,
    padding: 16
  },
  handoverCodeText: {
    color: colors.ink,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 6
  },
  handoverCodeInput: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 12,
    minHeight: 54,
    textAlign: "center"
  },
  handoverBuyerCodeInput: {
    fontFamily: Platform.select({ ios: "System", android: "sans-serif", default: "system-ui" }),
    fontSize: 18,
    fontWeight: "800"
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: "#FCEAE7",
    borderColor: "#E2B0A7",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 48,
    paddingHorizontal: 14
  },
  bikeDeleteInlineButton: {
    flexDirection: "row",
    gap: 8
  },
  bikeDeleteInlineIcon: {
    color: colors.red,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 20
  },
  dangerButtonText: {
    color: colors.red,
    fontSize: 14,
    fontWeight: "900"
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 13,
    paddingVertical: 12
  },
  twoColumn: {
    flexDirection: "row",
    gap: 10
  },
  memoInput: {
    minHeight: 112,
    textAlignVertical: "top"
  },
  chipRow: {
    gap: 8,
    paddingBottom: 2
  },
  chip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 14
  },
  activeChip: {
    backgroundColor: colors.navy,
    borderColor: colors.navy
  },
  chipText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  activeChipText: {
    color: "#FFFFFF"
  },
  infoPanel: {
    backgroundColor: "#EAF2F3",
    borderColor: "#C7DDE0",
    borderRadius: 8,
    borderWidth: 1,
    padding: 15
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0
  },
  modalHost: {
    flex: 1
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14
  },
  modalTextButton: {
    minWidth: 54,
    paddingVertical: 8
  },
  modalTextButtonLabel: {
    color: colors.teal,
    fontSize: 15,
    fontWeight: "900"
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  formContent: {
    gap: 12,
    padding: 18,
    paddingBottom: 34
  }
});
