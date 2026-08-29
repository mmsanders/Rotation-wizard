import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { FrameList } from './FrameList';
import { FrameControls } from './FrameControls';
import { ComparePanel } from './ComparePanel';
import { SettingsPanel } from './SettingsPanel';
import { DESKTOP_QUERY, useMediaQuery } from './useMediaQuery';

const TABS = [
  { id: 'frames', label: 'Frames' },
  { id: 'compare', label: 'Compare' },
  { id: 'setup', label: 'Setup' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * The control surface: a drag-up sheet on phones, a docked sidebar on desktop.
 *
 * Both layouts render exactly the same tab contents — only the container differs — so
 * there is one implementation of every control rather than a mobile and a desktop copy
 * that drift apart.
 */
export function Panel() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [tab, setTab] = useState<TabId>('frames');

  const tabBar = (
    <nav className="tabs" role="tablist" aria-label="Panel sections">
      {TABS.map((entry) => (
        <button
          key={entry.id}
          type="button"
          role="tab"
          aria-selected={tab === entry.id}
          className={`tabs__tab${tab === entry.id ? ' is-active' : ''}`}
          onClick={() => setTab(entry.id)}
        >
          {entry.label}
        </button>
      ))}
    </nav>
  );

  const content = (
    <div className="panel__content" role="tabpanel">
      {tab === 'frames' && (
        <div className="stack">
          <FrameList />
          <FrameControls />
        </div>
      )}
      {tab === 'compare' && <ComparePanel />}
      {tab === 'setup' && <SettingsPanel />}
    </div>
  );

  if (isDesktop) {
    return (
      <aside className="sidebar">
        <header className="sidebar__head">
          <h1 className="brand">
            Rotation <span>Wizard</span>
          </h1>
        </header>
        {tabBar}
        {content}
      </aside>
    );
  }

  return <BottomSheet header={tabBar}>{content}</BottomSheet>;
}
