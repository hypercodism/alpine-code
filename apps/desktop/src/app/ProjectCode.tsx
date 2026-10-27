import { FileViewer } from '@/features/file-viewer';
import { ScreenFiles } from '@/features/product-map/ScreenFiles';
import { FileNavigationProvider, useFileNavigation } from '@/shared/files';

/**
 * The 코드 tab (10-25 design canvas): the project's files by the screens they make, beside the file open. Its own
 * file navigation, so opening a file here shows it here and leaves the conversation beside the window as it was.
 */
export function ProjectCode({ cwd }: { cwd: string }) {
  return (
    <FileNavigationProvider cwd={cwd}>
      <Code cwd={cwd} />
    </FileNavigationProvider>
  );
}

function Code({ cwd }: { cwd: string }) {
  const navigation = useFileNavigation()!;
  return (
    <div className="flex min-h-0 min-w-0 grow bg-canvas">
      <div className="flex w-72 shrink-0 flex-col border-r border-line">
        <ScreenFiles
          cwd={cwd}
          selected={navigation.location?.path ?? null}
          onOpen={(path) => navigation.open({ path })}
          onBrowse={navigation.browse}
        />
      </div>
      <div className="flex min-h-0 min-w-0 grow flex-col px-6 py-5">
        <FileViewer />
      </div>
    </div>
  );
}
