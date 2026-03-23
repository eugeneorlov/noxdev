interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusStyles = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'skipped':
        return 'bg-amber-100 text-amber-800';
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'running':
        return 'bg-blue-100 text-blue-800 animate-pulse';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getStatusStyles(status)}`}>
      {status || 'Unknown'}
    </span>
  );
}