import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, ReloadOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import StatusBadge from '../components/common/StatusBadge';
import MeasureInput from '../components/common/MeasureInput';
import RecheckHistory from '../components/common/RecheckHistory';
import EmptyState from '../components/common/EmptyState';
import { useInspectionFilter } from '../hooks/useInspectionFilter';
import { usePointStore } from '../stores/pointStore';
import { DISTRICTS, FACILITY_TYPES } from '../types/point';
import { OCCUPIED_LEVELS, type OccupiedLevel } from '../types/inspection';
import { RECTIFY_STATUSES, type RectifyPlan, type RectifyStatus, type RecheckInput } from '../types/rectify';
import { judgeInspection } from '../utils/routeCheck';
import { isOverdue, todayStr } from '../utils/format';

interface RecheckDraft extends RecheckInput {}

function emptyDraft(inspector: string): RecheckDraft {
  return {
    date: todayStr(),
    inspector,
    slope: 4.5,
    clearWidth: 120,
    hasHandrail: true,
    tactileContinuous: true,
    occupied: '无',
    note: '',
  };
}

export default function Rectify() {
  const { message } = App.useApp();
  const { filter, setFilter, resetFilter, pendingRectifies, pointMap } = useInspectionFilter();
  const rectifies = usePointStore((s) => s.rectifies);
  const inspections = usePointStore((s) => s.inspections);
  const registerRecheck = usePointStore((s) => s.registerRecheck);
  const [statusFilter, setStatusFilter] = useState<RectifyStatus | ''>('');
  const [editing, setEditing] = useState<RectifyPlan | null>(null);
  const [draft, setDraft] = useState<RecheckDraft>(() => emptyDraft('督导员 李维'));
  const [saving, setSaving] = useState(false);

  const scoped = useMemo(
    () => rectifies.filter((r) => pointMap.has(r.pointId)),
    [rectifies, pointMap],
  );

  const visible = useMemo(
    () => (statusFilter ? scoped.filter((r) => r.status === statusFilter) : scoped),
    [scoped, statusFilter],
  );

  const groups = useMemo(() => {
    // 四个分组互斥：逾期条目（含复发）置顶，避免复发条目在多个分组重复出现
    const overdue = visible
      .filter((r) => r.status !== '已整改' && isOverdue(r.deadline, r.status))
      .sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
    const pending = visible
      .filter((r) => r.status === '待整改' && !isOverdue(r.deadline, r.status))
      .sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
    const relapse = visible
      .filter((r) => r.status === '复发' && !isOverdue(r.deadline, r.status))
      .sort((a, b) => (a.recheckDate < b.recheckDate ? 1 : -1));
    const done = visible
      .filter((r) => r.status === '已整改')
      .sort((a, b) => (a.recheckDate < b.recheckDate ? 1 : -1));
    return [
      { key: 'overdue', title: '逾期未整改（置顶）', items: overdue, danger: true },
      { key: 'pending', title: '整改期限内', items: pending, danger: false },
      { key: 'relapse', title: '复检复发', items: relapse, danger: true },
      { key: 'done', title: '已整改完成', items: done, danger: false },
    ].filter((g) => g.items.length > 0);
  }, [visible]);

  const judgement = useMemo(
    () =>
      judgeInspection({
        slope: draft.slope,
        clearWidth: draft.clearWidth,
        hasHandrail: draft.hasHandrail,
        tactileContinuous: draft.tactileContinuous,
        occupied: draft.occupied,
      }),
    [draft],
  );

  const openRecheck = (row: RectifyPlan) => {
    // 带出该点位最近一次现场测值，反复复检时只需改动变化项
    const latest = inspections
      .filter((i) => i.pointId === row.pointId)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const base = emptyDraft(latest?.inspector || '督导员 李维');
    if (latest) {
      base.slope = latest.slope;
      base.clearWidth = latest.clearWidth;
      base.hasHandrail = latest.hasHandrail;
      base.tactileContinuous = latest.tactileContinuous;
      base.occupied = latest.occupied as OccupiedLevel;
    }
    setEditing(row);
    setDraft(base);
  };

  const handleRecheck = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { rectify } = await registerRecheck(editing.id, {
        ...draft,
        date: draft.date || todayStr(),
      });
      message.success(
        rectify.status === '已整改'
          ? `复检达标（${judgement.conclusion}），条目已标记为已整改`
          : `复检仍不达标（${judgement.conclusion}），条目已标记为复发`,
      );
      setEditing(null);
    } catch (e) {
      message.error(`复检登记失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<RectifyPlan> = [
    {
      title: '点位',
      width: 220,
      render: (_, row) => {
        const p = pointMap.get(row.pointId);
        return p ? <Link to={`/points/${p.id}`}>{p.name}</Link> : row.pointId;
      },
    },
    {
      title: '行政区',
      width: 100,
      render: (_, row) => pointMap.get(row.pointId)?.district ?? '—',
    },
    { title: '整改要求', dataIndex: 'requirement', ellipsis: true },
    { title: '责任单位', dataIndex: 'unit', width: 170 },
    {
      title: '整改期限',
      dataIndex: 'deadline',
      width: 140,
      sorter: (a, b) => (a.deadline < b.deadline ? -1 : 1),
      render: (d: string, row) =>
        isOverdue(d, row.status) ? (
          <Space size={4}>
            {d}
            <Tag color="error">逾期</Tag>
          </Space>
        ) : (
          d
        ),
    },
    {
      title: '复检次数',
      width: 90,
      render: (_, row) => (row.rechecks?.length ? `${row.rechecks.length} 次` : <Typography.Text type="secondary">未复检</Typography.Text>),
    },
    {
      title: '最近复检',
      dataIndex: 'recheckDate',
      width: 120,
      render: (v: string) => v || <Typography.Text type="secondary">未复检</Typography.Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (v: string) => <StatusBadge value={v} kind="rectify" />,
    },
    {
      title: '操作',
      width: 120,
      render: (_, row) => (
        <Button size="small" type="primary" ghost onClick={() => openRecheck(row)} data-testid={`recheck-${row.id}`}>
          登记复检
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div className="gb-page-head">
        <div>
          <h1 className="gb-page-title">整改清单</h1>
          <Typography.Text type="secondary">
            按状态与期限分组，逾期条目置顶；每次复检录入现场实测值并自动判定，测量记录并入点位核验历史。
          </Typography.Text>
        </div>
        <Space wrap>
          <Select
            placeholder="行政区"
            style={{ width: 130 }}
            allowClear
            value={filter.district || undefined}
            onChange={(v) => setFilter({ district: v ?? '' })}
            options={DISTRICTS.map((d) => ({ value: d, label: d }))}
          />
          <Select
            placeholder="设施类型"
            style={{ width: 150 }}
            allowClear
            value={filter.facilityType || undefined}
            onChange={(v) => setFilter({ facilityType: v ?? '' })}
            options={FACILITY_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <Select
            placeholder="整改状态"
            style={{ width: 140 }}
            allowClear
            value={statusFilter || undefined}
            onChange={(v) => setStatusFilter((v as RectifyStatus) ?? '')}
            options={RECTIFY_STATUSES.map((s) => ({ value: s, label: s }))}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              resetFilter();
              setStatusFilter('');
            }}
          >
            重置
          </Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 8 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary">整改条目总数</Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 600 }} data-testid="rectify-total">
              {scoped.length}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary">待整改（含逾期、复发）</Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#d46b08' }} data-testid="rectify-pending">
              {pendingRectifies.length}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary">已整改</Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#389e0d' }}>
              {scoped.filter((r) => r.status === '已整改').length}
            </div>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Typography.Text type="secondary">逾期条目</Typography.Text>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#cf1322' }} data-testid="rectify-overdue">
              {scoped.filter((r) => isOverdue(r.deadline, r.status)).length}
            </div>
          </Card>
        </Col>
      </Row>

      {groups.length ? (
        groups.map((g) => (
          <Card
            key={g.key}
            size="small"
            style={{ marginTop: 16 }}
            title={
              <Space size={8}>
                <span>{g.title}</span>
                <Tag color={g.danger ? 'error' : 'default'}>{g.items.length}</Tag>
              </Space>
            }
            data-testid={`group-${g.key}`}
          >
            <Table<RectifyPlan>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={g.items}
              columns={columns}
              rowClassName={(row) => (isOverdue(row.deadline, row.status) ? 'gb-overdue-row' : '')}
              expandable={{
                rowExpandable: (row) => (row.rechecks?.length ?? 0) > 0,
                expandedRowRender: (row) => (
                  <div>
                    <Typography.Text strong>复检历史（{row.rechecks.length} 次）</Typography.Text>
                    <div style={{ marginTop: 8 }}>
                      <RecheckHistory records={row.rechecks} pagination />
                    </div>
                  </div>
                ),
              }}
            />
          </Card>
        ))
      ) : (
        <EmptyState
          title="没有匹配的整改条目"
          description="调整行政区、设施类型或状态筛选后再试"
          extra={
            <Button onClick={() => { resetFilter(); setStatusFilter(''); }}>
              <CheckOutlined /> 清空筛选
            </Button>
          }
        />
      )}

      <Modal
        title={editing ? `登记复检 · ${pointMap.get(editing.pointId)?.name ?? editing.pointId}` : '登记复检'}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        onOk={handleRecheck}
        confirmLoading={saving}
        okText="保存复检结果"
        width={760}
        destroyOnClose
      >
        {editing ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Typography.Text type="secondary">
              整改要求：{editing.requirement}
              <br />
              责任单位：{editing.unit} · 期限：{editing.deadline}
            </Typography.Text>

            <Alert
              type={judgement.conclusion === '合格' ? 'success' : 'warning'}
              showIcon
              data-testid="recheck-verdict"
              message={
                <Space wrap>
                  <span>自动判定：</span>
                  <StatusBadge value={judgement.conclusion} kind="conclusion" />
                  <Typography.Text>
                    {judgement.conclusion === '合格'
                      ? '复检达标，保存后条目标记为「已整改」'
                      : '仍不达标，保存后条目标记为「复发」并继续跟踪'}
                  </Typography.Text>
                </Space>
              }
              description={judgement.reasons.join('；')}
            />

            <Form layout="vertical">
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item label="复检日期" required>
                    <DatePicker
                      style={{ width: '100%' }}
                      value={draft.date ? dayjs(draft.date) : null}
                      onChange={(d) =>
                        setDraft((c) => ({ ...c, date: d ? d.format('YYYY-MM-DD') : todayStr() }))
                      }
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="复检人">
                    <Input
                      value={draft.inspector}
                      onChange={(e) => setDraft((c) => ({ ...c, inspector: e.target.value }))}
                      placeholder="现场复检督导员"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label=" ">
                    <MeasureInput
                      label="坡度"
                      value={draft.slope}
                      onChange={(v) => setDraft((c) => ({ ...c, slope: v }))}
                      unit="%"
                      pass={5}
                      fail={8}
                      direction="max"
                      min={0}
                      max={100}
                      hint="纵坡不应大于 5%，超过 8% 判定不合格"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label=" ">
                    <MeasureInput
                      label="净宽"
                      value={draft.clearWidth}
                      onChange={(v) => setDraft((c) => ({ ...c, clearWidth: v }))}
                      unit="cm"
                      pass={120}
                      fail={90}
                      direction="min"
                      min={0}
                      max={500}
                      step={1}
                      hint="净宽不应小于 120cm，小于 90cm 判定不合格"
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item label="扶手">
                    <Switch
                      checked={draft.hasHandrail}
                      onChange={(v) => setDraft((c) => ({ ...c, hasHandrail: v }))}
                      checkedChildren="有"
                      unCheckedChildren="无"
                      data-testid="recheck-switch-handrail"
                    />
                  </Form.Item>
                </Col>
                <Col xs={12} md={8}>
                  <Form.Item label="盲道连续">
                    <Switch
                      checked={draft.tactileContinuous}
                      onChange={(v) => setDraft((c) => ({ ...c, tactileContinuous: v }))}
                      checkedChildren="连续"
                      unCheckedChildren="断续"
                      data-testid="recheck-switch-tactile"
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label="被占用情况">
                    <Select
                      value={draft.occupied}
                      onChange={(v: OccupiedLevel) => setDraft((c) => ({ ...c, occupied: v }))}
                      options={OCCUPIED_LEVELS.map((o) => ({ value: o, label: o }))}
                    />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item label="复检说明">
                    <Input.TextArea
                      rows={3}
                      value={draft.note}
                      onChange={(e) => setDraft((c) => ({ ...c, note: e.target.value }))}
                      placeholder="如：已清退占用、坡道重做完成，现场实测坡度 4.2%"
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Space>
        ) : null}
      </Modal>
    </div>
  );
}
