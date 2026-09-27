import type { InspectionConclusion, OccupiedLevel } from './inspection';

/** 整改状态 */
export type RectifyStatus = '待整改' | '已整改' | '复发';

export const RECTIFY_STATUSES: RectifyStatus[] = ['待整改', '已整改', '复发'];

/**
 * 单次复检记录。
 * 每次登记复检都会落一条：现场测值自动判定结论，
 * 结论为「合格」条目转已整改，否则（限期整改 / 不合格）标记复发。
 */
export interface RecheckRecord {
  id: string;
  /** 所属整改条目 id */
  rectifyId: string;
  /** 该次复检并入点位核验历史时对应的核验记录 id */
  inspectionId: string;
  /** 复检日期 YYYY-MM-DD */
  date: string;
  /** 复检人 */
  inspector: string;
  /** 坡度 % */
  slope: number;
  /** 净宽 cm */
  clearWidth: number;
  /** 扶手有无 */
  hasHandrail: boolean;
  /** 盲道连续性 */
  tactileContinuous: boolean;
  /** 被占用情况 */
  occupied: OccupiedLevel;
  /** 按现场测值自动判定的结论 */
  conclusion: InspectionConclusion;
  /** 判定依据（自动生成） */
  reasons: string[];
  /** 本次复检后条目状态：达标=已整改，未达标=复发 */
  result: Extract<RectifyStatus, '已整改' | '复发'>;
  /** 复检说明 */
  note: string;
  createdAt: string;
}

/** 整改跟踪条目 */
export interface RectifyPlan {
  id: string;
  pointId: string;
  /** 整改要求 */
  requirement: string;
  /** 责任单位 */
  unit: string;
  /** 整改期限 YYYY-MM-DD */
  deadline: string;
  /** 最近一次复检日期 YYYY-MM-DD，未复检为空字符串 */
  recheckDate: string;
  status: RectifyStatus;
  /** 复检历史，按登记时间正序排列（最早在前） */
  rechecks: RecheckRecord[];
  createdAt: string;
}

/** 新建整改条目不携带复检历史 */
export type RectifyPlanDraft = Omit<RectifyPlan, 'id' | 'createdAt' | 'rechecks'> & {
  rechecks?: RecheckRecord[];
};

/** 复检登记表单草稿 */
export interface RecheckDraft {
  date: string;
  inspector: string;
  slope: number;
  clearWidth: number;
  hasHandrail: boolean;
  tactileContinuous: boolean;
  occupied: OccupiedLevel;
  note: string;
}

/** 按状态与期限分组后的清单结构 */
export interface RectifyGroup {
  key: string;
  title: string;
  items: RectifyPlan[];
}
