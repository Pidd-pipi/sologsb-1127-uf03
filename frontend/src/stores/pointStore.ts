import { create } from 'zustand';
import { db, ensureSeed } from '../db';
import type { AccessPoint, AccessPointDraft } from '../types/point';
import type { Inspection, InspectionDraft } from '../types/inspection';
import {
  rectifyStatusOf,
  type RectifyPlan,
  type RectifyPlanDraft,
  type RecheckInput,
  type RecheckRecord,
} from '../types/rectify';
import { judgeInspection } from '../utils/routeCheck';
import { makeId, toPlain, todayStr } from '../utils/format';

interface PointState {
  points: AccessPoint[];
  inspections: Inspection[];
  rectifies: RectifyPlan[];
  loading: boolean;
  loaded: boolean;
  error: string;
  load: () => Promise<void>;
  addPoint: (draft: AccessPointDraft) => Promise<AccessPoint>;
  addInspection: (draft: InspectionDraft) => Promise<Inspection>;
  addRectify: (draft: RectifyPlanDraft) => Promise<RectifyPlan>;
  updateRectify: (id: string, patch: Partial<RectifyPlan>) => Promise<void>;
  /** 登记一次复检：按实测值自动判定，写核验历史并更新整改状态 */
  registerRecheck: (rectifyId: string, input: RecheckInput) => Promise<{ rectify: RectifyPlan; inspection: Inspection }>;
  getPoint: (id: string) => AccessPoint | undefined;
  inspectionsOf: (pointId: string) => Inspection[];
  rectifiesOf: (pointId: string) => RectifyPlan[];
}

/** 核验记录排序：日期新的在前，同日按登记时间新的在前 */
function compareInspectionDesc(a: Inspection, b: Inspection): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export const usePointStore = create<PointState>((set, get) => ({
  points: [],
  inspections: [],
  rectifies: [],
  loading: false,
  loaded: false,
  error: '',

  load: async () => {
    set({ loading: true, error: '' });
    try {
      await ensureSeed();
      const [points, inspections, rectifies] = await Promise.all([
        db.points.toArray(),
        db.inspections.toArray(),
        db.rectifies.toArray(),
      ]);
      set({
        points: points.sort((a, b) => a.code.localeCompare(b.code)),
        inspections: inspections.sort(compareInspectionDesc),
        rectifies: [...rectifies].sort((a, b) => (a.deadline < b.deadline ? -1 : 1)),
        loading: false,
        loaded: true,
      });
    } catch (e) {
      set({ loading: false, loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  },

  addPoint: async (draft) => {
    const now = new Date().toISOString();
    const point: AccessPoint = toPlain({
      ...draft,
      id: makeId('pt'),
      createdAt: now,
      updatedAt: now,
    });
    await db.points.put(point);
    set((s) => ({ points: [...s.points, point].sort((a, b) => a.code.localeCompare(b.code)) }));
    return point;
  },

  addInspection: async (draft) => {
    const inspection: Inspection = toPlain({
      ...draft,
      source: '核验',
      id: makeId('ins'),
      createdAt: new Date().toISOString(),
    });
    await db.inspections.put(inspection);
    set((s) => ({
      inspections: [inspection, ...s.inspections].sort(compareInspectionDesc),
    }));
    // 结论为不合格时自动生成整改条目，形成闭环
    if (inspection.conclusion === '不合格') {
      const exists = get().rectifies.some(
        (r) => r.pointId === inspection.pointId && r.status !== '已整改',
      );
      if (!exists) {
        await get().addRectify({
          pointId: inspection.pointId,
          requirement: `按 ${inspection.date} 核验结论整改：${inspection.problem || '坡度、净宽或占用问题'}`,
          unit: '待指派责任单位',
          deadline: todayStr(),
          recheckDate: '',
          status: '待整改',
        });
      }
    }
    return inspection;
  },

  addRectify: async (draft) => {
    const plan: RectifyPlan = toPlain({
      ...draft,
      rechecks: [],
      id: makeId('rct'),
      createdAt: new Date().toISOString(),
    });
    await db.rectifies.put(plan);
    set((s) => ({
      rectifies: [...s.rectifies, plan].sort((a, b) => (a.deadline < b.deadline ? -1 : 1)),
    }));
    return plan;
  },

  updateRectify: async (id, patch) => {
    const plain = toPlain(patch);
    await db.rectifies.update(id, plain);
    set((s) => ({
      rectifies: s.rectifies.map((r) => (r.id === id ? { ...r, ...plain } : r)),
    }));
  },

  registerRecheck: async (rectifyId, input) => {
    const plan = get().rectifies.find((r) => r.id === rectifyId);
    if (!plan) throw new Error('整改条目不存在或已被删除');

    const judged = judgeInspection({
      slope: input.slope,
      clearWidth: input.clearWidth,
      hasHandrail: input.hasHandrail,
      tactileContinuous: input.tactileContinuous,
      occupied: input.occupied,
    });
    const now = new Date().toISOString();
    const date = input.date || todayStr();
    const note = input.note.trim();
    const status = rectifyStatusOf(judged.conclusion);

    const inspection: Inspection = toPlain({
      id: makeId('ins'),
      pointId: plan.pointId,
      date,
      inspector: input.inspector.trim() || '未署名督导员',
      slope: input.slope,
      clearWidth: input.clearWidth,
      hasHandrail: input.hasHandrail,
      tactileContinuous: input.tactileContinuous,
      occupied: input.occupied,
      conclusion: judged.conclusion,
      problem: note || judged.reasons.join('；'),
      source: '复检',
      rectifyId: plan.id,
      createdAt: now,
    });

    const record: RecheckRecord = toPlain({
      id: makeId('rchk'),
      rectifyId: plan.id,
      inspectionId: inspection.id,
      date,
      inspector: inspection.inspector,
      slope: input.slope,
      clearWidth: input.clearWidth,
      hasHandrail: input.hasHandrail,
      tactileContinuous: input.tactileContinuous,
      occupied: input.occupied,
      conclusion: judged.conclusion,
      reasons: judged.reasons,
      note,
      result: status,
      createdAt: now,
    });

    const updated: RectifyPlan = {
      ...plan,
      status,
      recheckDate: date,
      rechecks: [...(plan.rechecks ?? []), record],
    };

    // 复检记录与核验历史同事务落库，避免只改状态、测量值丢失
    await db.transaction('rw', db.inspections, db.rectifies, async () => {
      await db.inspections.put(inspection);
      await db.rectifies.put(updated);
    });

    set((s) => ({
      inspections: [inspection, ...s.inspections].sort(compareInspectionDesc),
      rectifies: s.rectifies.map((r) => (r.id === plan.id ? updated : r)),
    }));

    return { rectify: updated, inspection };
  },

  getPoint: (id) => get().points.find((p) => p.id === id),

  inspectionsOf: (pointId) =>
    get()
      .inspections.filter((i) => i.pointId === pointId)
      .sort(compareInspectionDesc),

  rectifiesOf: (pointId) =>
    get()
      .rectifies.filter((r) => r.pointId === pointId)
      .sort((a, b) => (a.deadline < b.deadline ? -1 : 1)),
}));
