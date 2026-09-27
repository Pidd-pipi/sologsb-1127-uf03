import { Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import StatusBadge from './StatusBadge';
import type { RecheckRecord } from '../../types/rectify';

interface RecheckHistoryProps {
  records: RecheckRecord[];
  size?: 'small' | 'middle';
  pagination?: boolean;
}

/** 同一条整改的历次复检记录：结论、日期、现场实测值与说明逐条可查 */
export default function RecheckHistory({ records, size = 'small', pagination = false }: RecheckHistoryProps) {
  const ordered = [...records].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1,
  );

  const columns: ColumnsType<RecheckRecord> = [
    {
      title: '次序',
      width: 70,
      render: (_, __, index) => `第 ${index + 1} 次`,
    },
    { title: '复检日期', dataIndex: 'date', width: 110 },
    { title: '复检人', dataIndex: 'inspector', width: 120, render: (v: string) => v || '—' },
    {
      title: '坡度',
      dataIndex: 'slope',
      width: 80,
      render: (v: number) => `${v}%`,
    },
    {
      title: '净宽',
      dataIndex: 'clearWidth',
      width: 90,
      render: (v: number) => `${v} cm`,
    },
    {
      title: '扶手',
      dataIndex: 'hasHandrail',
      width: 70,
      render: (v: boolean) => (v ? '有' : '无'),
    },
    {
      title: '盲道',
      dataIndex: 'tactileContinuous',
      width: 80,
      render: (v: boolean) => (v ? '连续' : '断续'),
    },
    { title: '占用情况', dataIndex: 'occupied', width: 100 },
    {
      title: '判定结论',
      dataIndex: 'conclusion',
      width: 100,
      render: (v: RecheckRecord['conclusion']) => <StatusBadge value={v} kind="conclusion" />,
    },
    {
      title: '整改判定',
      dataIndex: 'result',
      width: 90,
      render: (v: RecheckRecord['result']) => <StatusBadge value={v} kind="rectify" />,
    },
    {
      title: '说明与判定依据',
      dataIndex: 'note',
      render: (note: string, row) => (
        <div>
          <Typography.Text>{note || <Typography.Text type="secondary">（无说明）</Typography.Text>}</Typography.Text>
          {row.reasons.length > 0 && (
            <div>
              <Typography.Text type="secondary" className="gb-muted" style={{ fontSize: 12 }}>
                {row.reasons.join('；')}
              </Typography.Text>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <Table<RecheckRecord>
      rowKey="id"
      size={size}
      pagination={pagination ? { pageSize: 5, hideOnSinglePage: true } : false}
      dataSource={ordered}
      columns={columns}
      data-testid="recheck-history"
    />
  );
}
