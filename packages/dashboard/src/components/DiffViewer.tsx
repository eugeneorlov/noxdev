interface DiffViewerProps {
  diff: string;
}

export function DiffViewer({ diff }: DiffViewerProps) {
  if (!diff) {
    return (
      <div className="text-gray-500 text-sm">
        No diff captured for this task.
      </div>
    );
  }

  const lines = diff.split('\n');
  let lineNumber = 0;

  const getLineType = (line: string): {
    type: 'file-header' | 'hunk-header' | 'addition' | 'removal' | 'context';
    className: string;
  } => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return {
        type: 'file-header',
        className: 'bg-gray-100 font-bold text-gray-800'
      };
    }
    if (line.startsWith('@@')) {
      return {
        type: 'hunk-header',
        className: 'bg-blue-50 text-blue-800'
      };
    }
    if (line.startsWith('+')) {
      return {
        type: 'addition',
        className: 'bg-green-50 text-green-800'
      };
    }
    if (line.startsWith('-')) {
      return {
        type: 'removal',
        className: 'bg-red-50 text-red-800'
      };
    }
    return {
      type: 'context',
      className: ''
    };
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
      <div className="overflow-x-auto">
        <pre className="text-xs font-mono bg-white">
          {lines.map((line, index) => {
            const { className } = getLineType(line);
            lineNumber++;

            return (
              <div key={index} className={`flex ${className}`}>
                <div className="flex-shrink-0 w-12 px-2 py-0.5 text-gray-400 bg-gray-50 border-r border-gray-200 text-right select-none">
                  {lineNumber}
                </div>
                <div className="flex-1 px-3 py-0.5 whitespace-pre">
                  {line || ' '}
                </div>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}