/** 核验结论 */
export type InspectionConclusion = '合格' | '限期整改' | '不合格';

export const CONCLUSIONS: InspectionConclusion[] = ['合格', '限期整改', '不合格'];

/** 被占用情况 */
export type OccupiedLevel = '无' | '临时占用' | '长期占用';

export const OCCUPIED_LEVELS: OccupiedLevel[] = ['无', '临时占用', '长期占用'];

/** 核验来源：常规核验或整改复检（复检登记自动写入核验历史） */
export type InspectionSource = '核验' | '复检';

/** 核验记录 */
export interface Inspection {
  id: string;
  pointId: string;
  /** 核验日期 YYYY-MM-DD */
  date: string;
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
  conclusion: InspectionConclusion;
  problem: string;
  /** 记录来源，历史数据缺省视为常规核验 */
  source?: InspectionSource;
  /** 复检来源时对应的整改条目 id */
  rectifyId?: string;
  createdAt: string;
}

export type InspectionDraft = Omit<Inspection, 'id' | 'createdAt' | 'source' | 'rectifyId'>;
