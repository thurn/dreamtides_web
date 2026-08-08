// @vitest-environment jsdom

import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appImport: vi.fn(),
  createRoot: vi.fn(),
  dreamAvatarEditorComponent: vi.fn(() => null),
  render: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: mocks.createRoot,
}));

vi.mock("./CardEditorApp", () => ({
  default: function MockCardEditorApp() {
    return null;
  },
}));

vi.mock("./DreamsignEditorApp", () => ({
  default: function MockDreamsignEditorApp() {
    return null;
  },
}));

vi.mock("./DreamwellEditorApp", () => ({
  default: function MockDreamwellEditorApp() {
    return null;
  },
}));

vi.mock("./DreamscapeEditorApp", () => ({
  default: function MockDreamscapeEditorApp() {
    return null;
  },
}));

vi.mock("./DreamAvatarEditorApp", () => ({
  default: mocks.dreamAvatarEditorComponent,
}));

vi.mock("./GlossaryEditorApp", () => ({
  default: function MockGlossaryEditorApp() {
    return null;
  },
}));


vi.mock("./ExplorationEditorApp", () => ({
  default: function MockExplorationEditorApp() {
    return null;
  },
}));

vi.mock("../debug/OffersDebugApp", () => ({
  default: function MockOffersDebugApp() {
    return null;
  },
}));

vi.mock("../coop/FrontDoorApp", () => {
  return {
    default: function MockFrontDoorApp(_props: {
      entry?: string;
      directTutorialBattle?: boolean;
    }) {
      return null;
    },
  };
});

vi.mock("../screens/cumulus_adapters/TutorialScreenAdapter", () => ({
  TutorialScreenAdapter: function MockTutorialScreenAdapter() {
    return null;
  },
}));

vi.mock("../App.tsx", () => {
  mocks.appImport();
  return {
    default: function MockApp() {
      return null;
    },
  };
});

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  mocks.appImport.mockClear();
  mocks.createRoot.mockClear();
  mocks.dreamAvatarEditorComponent.mockClear();
  mocks.render.mockClear();
  mocks.createRoot.mockReturnValue({ render: mocks.render });
  vi.resetModules();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("main editor route", () => {
  function renderedRouteComponent(): ReactElement {
    const strictMode = mocks.render.mock.calls[0]?.[0] as ReactElement<{
      children: ReactElement<{ children: ReactElement }>;
    }>;
    return strictMode.props.children.props.children;
  }

  function renderedAppProps(): {
    frontDoorEntry?: string;
    directTutorialBattle?: boolean;
    runtimeConfig?: { aiMode: boolean };
  } {
    type AppProps = {
      frontDoorEntry?: string;
      directTutorialBattle?: boolean;
      runtimeConfig?: { aiMode: boolean };
    };
    const route = renderedRouteComponent() as ReactElement<{
      children: ReactElement<AppProps>;
    }>;
    const app = route.props.children;
    return app.props;
  }

  it("mounts the isolated editor for the Vite-served /editor/ path", async () => {
    window.history.pushState(null, "", "/editor/");

    await import("../main.tsx");

    expect(mocks.appImport).not.toHaveBeenCalled();
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it("mounts the isolated dreamsign editor for the Vite-served /dreamsigns/ path", async () => {
    window.history.pushState(null, "", "/dreamsigns/");

    await import("../main.tsx");

    expect(mocks.appImport).not.toHaveBeenCalled();
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it("mounts the isolated Dreamwell editor for the Vite-served /dreamwell/ path", async () => {
    window.history.pushState(null, "", "/dreamwell/");

    await import("../main.tsx");

    expect(mocks.appImport).not.toHaveBeenCalled();
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it("mounts the isolated dreamscape editor for the Vite-served /dreamscapes/ path", async () => {
    window.history.pushState(null, "", "/dreamscapes/");

    await import("../main.tsx");

    expect(mocks.appImport).not.toHaveBeenCalled();
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it.each(["/avatars/", "/dreamavatars/"])(
    "mounts the Dream Avatar editor and canonicalizes the %s alias",
    async (alias) => {
      window.history.pushState(null, "", `${alias}?q=Aurora#results`);

      await import("../main.tsx");

      expect(mocks.appImport).not.toHaveBeenCalled();
      expect(renderedRouteComponent().type).toBe(
        mocks.dreamAvatarEditorComponent,
      );
      expect(window.location.pathname).toBe("/dream-avatars");
      expect(window.location.search).toBe("?q=Aurora");
      expect(window.location.hash).toBe("#results");
      expect(mocks.createRoot).toHaveBeenCalledWith(
        document.getElementById("root"),
      );
      expect(mocks.render).toHaveBeenCalledTimes(1);
    },
  );

  it("mounts the isolated glossary editor for the Vite-served /glossary/ path", async () => {
    window.history.pushState(null, "", "/glossary/");

    await import("../main.tsx");

    expect(mocks.appImport).not.toHaveBeenCalled();
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it("mounts the isolated exploration editor for the Vite-served /exploration/ path", async () => {
    window.history.pushState(null, "", "/exploration/");

    await import("../main.tsx");

    expect(mocks.appImport).not.toHaveBeenCalled();
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it("mounts the isolated OfferTile debug page for the Vite-served /offers/ path", async () => {
    window.history.pushState(null, "", "/offers/");

    await import("../main.tsx");

    expect(mocks.appImport).not.toHaveBeenCalled();
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it("mounts the room app with loading as the creation entry", async () => {
    window.history.pushState(null, "", "/loading/");

    await import("../main.tsx");

    expect(renderedAppProps().frontDoorEntry).toBe("loading");
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it("mounts the room app with tutorial as the creation entry", async () => {
    window.history.pushState(null, "", "/tutorial/");

    await import("../main.tsx");

    expect(renderedAppProps().frontDoorEntry).toBe("tutorial");
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it("mounts the room app with main as the creation entry", async () => {
    window.history.pushState(null, "", "/main/");

    await import("../main.tsx");

    expect(renderedAppProps().frontDoorEntry).toBe("main");
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it("starts the automated tutorial battle from the goto parameter", async () => {
    window.history.pushState(null, "", "/?goto=tutorial-battle");

    await import("../main.tsx");

    expect(renderedAppProps()).toMatchObject({
      frontDoorEntry: "tutorial",
      directTutorialBattle: true,
      runtimeConfig: { aiMode: false },
    });
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });
});
