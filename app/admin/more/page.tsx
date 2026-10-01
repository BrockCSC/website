"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { LogOut } from "lucide-react";
import { ListGroup, ListRow } from "@/components/ui/list-group";
import { Segmented } from "@/components/ui/segmented";
import { setTheme } from "@/components/theme-toggle";
import { DESK_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { ask } from "../ask";
import { useAdminLogout, useAdminMail } from "../chrome";
import { SECTION_ICONS } from "../icons";
import { pinnedSections } from "../nav";
import { AdminPage } from "../page-frame";
import { visibleSections } from "../sections";
import { useSession } from "../session";

type Theme = "light" | "dark";

// The theme is a class on <html> (theme-toggle.tsx); follow it so the
// control stays right when the palette or another tab flips it.
const subscribeTheme = (onChange: () => void) => {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
};
const readTheme = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";
const serverTheme = (): Theme => "light";

/** Phone-only: the sections the tab bar doesn't pin, preferences and log out. */
export default function MorePage() {
  const router = useRouter();
  const desk = useMediaQuery(DESK_QUERY);
  const { user } = useSession();
  const { hasMailbox } = useAdminMail();
  const logout = useAdminLogout();
  const theme = useSyncExternalStore(subscribeTheme, readTheme, serverTheme);

  // The rail lists everything on desk. Landscape phones aren't desk, so
  // rotating on this screen keeps your place.
  useEffect(() => {
    if (desk) router.replace("/admin");
  }, [desk, router]);

  const sections = visibleSections(user, hasMailbox);
  const pinned = new Set(pinnedSections(sections).map((s) => s.href));
  const rest = sections.filter((section) => !pinned.has(section.href));

  const confirmLogout = async () => {
    const ok = await ask({
      title: "Log out?",
      confirmLabel: "Log out",
      destructive: true,
    });
    if (ok !== null) await logout();
  };

  return (
    <AdminPage width="narrow">
      <h1 className="text-3xl font-extrabold text-ink">More</h1>

      <div className="mt-6 flex flex-col gap-6">
        {rest.length > 0 && (
          <ListGroup header="Sections">
            {rest.map((section) => {
              const Icon = SECTION_ICONS[section.href];
              return (
                <ListRow
                  key={section.href}
                  href={section.href}
                  icon={Icon ? <Icon /> : undefined}
                  title={section.name}
                  detail={section.blurb}
                />
              );
            })}
          </ListGroup>
        )}

        <ListGroup header="Preferences">
          <ListRow
            title="Appearance"
            accessory={
              <Segmented
                label="Appearance"
                value={theme}
                onChange={setTheme}
                className="w-40 shrink-0"
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                ]}
              />
            }
          />
          <ListRow href="/site" external title="View public site" />
        </ListGroup>

        <ListGroup>
          <ListRow
            destructive
            icon={<LogOut />}
            title="Log out"
            onPress={() => void confirmLogout()}
          />
        </ListGroup>
      </div>
    </AdminPage>
  );
}
