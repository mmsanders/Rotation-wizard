import { SceneCanvas } from './scene/SceneCanvas';
import { Panel } from './ui/Panel';
import { ImportBanner } from './ui/ImportBanner';
import { DESKTOP_QUERY, useMediaQuery } from './ui/useMediaQuery';
import { useSceneStore } from './store/useSceneStore';
import { describeSequence } from './math/conventions';

/**
 * Layout shell: the 3D view fills the viewport, the control panel sits over it.
 *
 * The canvas is never resized by the panel — on a phone the sheet slides over the scene
 * rather than squeezing it, so orbiting stays usable at any sheet height.
 */
export function App() {
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const conventions = useSceneStore((s) => s.conventions);

  return (
    <div className={`app${isDesktop ? ' app--desktop' : ''}`}>
      <div className="app__scene">
        <SceneCanvas />
      </div>

      {!isDesktop && (
        <header className="topbar">
          <h1 className="brand">
            Rotation <span>Wizard</span>
          </h1>
          <span className="topbar__conventions">
            {conventions.upAxis} up · {describeSequence(conventions)}
          </span>
        </header>
      )}

      <Panel />
      <ImportBanner />
    </div>
  );
}
