import type { InspectionConclusion, OccupiedLevel } from './inspection';

/** 整改状态 */
export type RectifyStatus = '待整改' | '已整改' | '复发';

export const RECTIFY_STATUSES: RectifyStatus[] = ['待整改', '已整改', '复发'];

/**
 * 单次复检登记：现场实测值 + 自动判定结果。
 * 同一条整改可反复复检，每次复检生成一条记录并并入点位核验历史。
 */
export interface RecheckRecord {
  id: string;
  /** 关联整改条目 id */
  rectifyId: string;
  /** 对应写入点位核验历史的核验记录 id */
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
  /** 按实测值自动判定的核验结论 */
  conclusion: InspectionConclusion;
  /** 自动判定依据（坡度/净宽/扶手/盲道/占用逐条说明） */
  reasons: string[];
  /** 复检说明 */
  note: string;
  /** 由结论映射出的整改状态：合格 → 已整改，其余 → 复发 */
  result: RectifyStatus;
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
  /** 历次复检记录，最新一条在末尾 */
  rechecks: RecheckRecord[];
  createdAt: string;
}

export type RectifyPlanDraft = Omit<RectifyPlan, 'id' | 'createdAt' | 'rechecks'>;

/** 复检登记入参（不含自动判定与系统生成字段） */
export interface RecheckInput {
  date: string;
  inspector: string;
  slope: number;
  clearWidth: number;
  hasHandrail: boolean;
  tactileContinuous: boolean;
  occupied: OccupiedLevel;
  note: string;
}

/** 按核验结论映射整改状态：达标即已整改，仍不达标即复发 */
export function rectifyStatusOf(conclusion: InspectionConclusion): RectifyStatus {
  return conclusion === '合格' ? '已整改' : '复发';
}

/** 按状态与期限分组后的清单结构 */
export interface RectifyGroup {
  key: string;
  title: string;
  items: RectifyPlan[];
}
