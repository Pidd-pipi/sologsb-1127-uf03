import { create } from 'zustand';
import { db, ensureSeed } from '../db';
import type { AccessPoint, AccessPointDraft } from '../types/point';
import type { Inspection, InspectionDraft } from '../types/inspection';
import type { RectifyPlan, RectifyPlanDraft, RecheckDraft, RecheckRecord } from '../types/rectify';
import { makeId, toPlain, todayStr } from '../utils/format';
import { compareInspectionDesc, judgeInspection } from '../utils/routeCheck';

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
  /** 登记一次复检：实测值自动判定，生成核验记录与复检历史，并更新条目状态 */
  registerRecheck: (
    rectifyId: string,
    draft: RecheckDraft,
  ) => Promise<{ plan: RectifyPlan; inspection: Inspection; record: RecheckRecord }>;
  getPoint: (id: string) => AccessPoint | undefined;
  inspectionsOf: (pointId: string) => Inspection[];
  rectifiesOf: (pointId: string) => RectifyPlan[];
}

/** 复检实测值转成核验问题描述：未达标列判定依据，达标则留空（说明另存于复检记录） */
function buildRecheckProblem(conclusion: Inspection['conclusion'], reasons: string[], note: string): string {
  const parts = conclusion === '合格' ? [] : [reasons.join('；')];
  const trimmed = note.trim();
  if (trimmed) parts.push(`复检说明：${trimmed}`);
  return parts.join('；');
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
      rechecks: draft.rechecks ?? [],
      id: makeId('rct'),
      createdAt: new Date().toISOString(),
    });
    await db.rectifies.put(plan);
    set((s) => ({
      rectifies: [...s.rectifies, plan].sort((a, b) => (a.deadline < b.deadline ? -1 : 1)),
    }));
    return plan;
  },

  registerRecheck: async (rectifyId, draft) => {
    const plan = get().rectifies.find((r) => r.id === rectifyId);
    if (!plan) throw new Error('未找到整改条目');

    // 现场实测值自动判定：达标（合格）→ 已整改；限期整改 / 不合格 → 复发
    const judged = judgeInspection({
      slope: draft.slope,
      clearWidth: draft.clearWidth,
      hasHandrail: draft.hasHandrail,
      tactileContinuous: draft.tactileContinuous,
      occupied: draft.occupied,
    });
    const result = judged.conclusion === '合格' ? '已整改' : '复发';
    const now = new Date().toISOString();
    const date = draft.date || todayStr();

    // 复检测量并入点位核验历史，总览与点位详情按最新结论刷新
    const inspection: Inspection = toPlain({
      id: makeId('ins'),
      pointId: plan.pointId,
      date,
      inspector: draft.inspector.trim() || '未署名督导员',
      slope: draft.slope,
      clearWidth: draft.clearWidth,
      hasHandrail: draft.hasHandrail,
      tactileContinuous: draft.tactileContinuous,
      occupied: draft.occupied,
      conclusion: judged.conclusion,
      problem: buildRecheckProblem(judged.conclusion, judged.reasons, draft.note),
      createdAt: now,
    });
    const record: RecheckRecord = toPlain({
      id: makeId('rck'),
      rectifyId: plan.id,
      inspectionId: inspection.id,
      date,
      inspector: inspection.inspector,
      slope: draft.slope,
      clearWidth: draft.clearWidth,
      hasHandrail: draft.hasHandrail,
      tactileContinuous: draft.tactileContinuous,
      occupied: draft.occupied,
      conclusion: judged.conclusion,
      reasons: judged.reasons,
      result,
      note: draft.note.trim(),
      createdAt: now,
    });
    const updated: RectifyPlan = {
      ...plan,
      status: result,
      recheckDate: date,
      rechecks: [...(plan.rechecks ?? []), record],
    };

    await db.transaction('rw', db.inspections, db.rectifies, async () => {
      await db.inspections.put(inspection);
      await db.rectifies.put(updated);
    });

    set((s) => ({
      inspections: [inspection, ...s.inspections].sort(compareInspectionDesc),
      rectifies: s.rectifies.map((r) => (r.id === plan.id ? updated : r)),
    }));
    return { plan: updated, inspection, record };
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
