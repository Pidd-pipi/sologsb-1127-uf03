import { useMemo } from 'react';
import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import StatusBadge from './StatusBadge';
import type { RecheckRecord } from '../../types/rectify';

interface RecheckHistoryProps {
  records: RecheckRecord[];
  /** 紧凑模式：用于整改清单展开行，默认 false */
  compact?: boolean;
}

/**
 * 整改条目的复检历史：每次复检一行，
 * 可分清每次复检的日期、自动判定结论、复检后状态（已整改 / 复发）与说明。
 */
export default function RecheckHistory({ records, compact = false }: RecheckHistoryProps) {
  // 展示按时间倒序（最新一次在前）；序号仍按登记先后计
  const rows = useMemo(
    () =>
      [...records]
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1)),
    [records],
  );

  const columns: ColumnsType<RecheckRecord> = [
    {
      title: '次数',
      width: 64,
      render: (_, row) => {
        const seq = records.findIndex((r) => r.id === row.id) + 1;
        return `第 ${seq} 次`;
      },
    },
    { title: '复检日期', dataIndex: 'date', width: 110 },
    { title: '复检人', dataIndex: 'inspector', width: 120 },
    { title: '坡度', dataIndex: 'slope', width: 72, render: (v: number) => `${v}%` },
    { title: '净宽', dataIndex: 'clearWidth', width: 80, render: (v: number) => `${v} cm` },
    { title: '扶手', dataIndex: 'hasHandrail', width: 64, render: (v: boolean) => (v ? '有' : '无') },
    {
      title: '盲道',
      dataIndex: 'tactileContinuous',
      width: 72,
      render: (v: boolean) => (v ? '连续' : '断续'),
    },
    { title: '占用', dataIndex: 'occupied', width: 90 },
    {
      title: '自动判定',
      dataIndex: 'conclusion',
      width: 100,
      render: (v: RecheckRecord['conclusion']) => <StatusBadge value={v} kind="conclusion" />,
    },
    {
      title: '复检结论',
      dataIndex: 'result',
      width: 96,
      render: (v: RecheckRecord['result']) => <StatusBadge value={v} kind="rectify" />,
    },
    {
      title: '说明',
      dataIndex: 'note',
      ellipsis: true,
      render: (v: string, row) =>
        v ? (
          v
        ) : (
          <Typography.Text type="secondary">
            {row.reasons[0] || '无'}
          </Typography.Text>
        ),
    },
  ];

  if (!rows.length) {
    return (
      <Typography.Text type="secondary" data-testid="recheck-empty">
        尚未登记复检；登记时需填写日期、坡度、净宽、扶手、盲道连续性与占用情况，系统按实测值自动判定。
      </Typography.Text>
    );
  }

  return (
    <Table<RecheckRecord>
      rowKey="id"
      size="small"
      pagination={false}
      dataSource={rows}
      columns={columns}
      scroll={compact ? { x: 980 } : undefined}
      data-testid="recheck-history"
    />
  );
}
