import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import styles from "./editorial-section.module.css";

export type EditorialGraphicKind =
  | "onboarding"
  | "templates"
  | "quality"
  | "thermal"
  | "books";

export type EditorialGraphic = { kind: EditorialGraphicKind };

type EditorialSectionProps = {
  index: string;
  title: string;
  description: string;
  status: string;
  href: string;
  action: string;
  graphic?: EditorialGraphic;
};

const graphicAssets: Record<
  EditorialGraphicKind,
  { light: string; dark: string }
> = {
  onboarding: {
    light: "/homepage-graphics/01_newcomer_light.svg",
    dark: "/homepage-graphics/02_newcomer_dark.svg",
  },
  quality: {
    light: "/homepage-graphics/03_quality_light.svg",
    dark: "/homepage-graphics/04_quality_dark.svg",
  },
  thermal: {
    light: "/homepage-graphics/05_thermal_light.svg",
    dark: "/homepage-graphics/06_thermal_dark.svg",
  },
  templates: {
    light: "/homepage-graphics/07_template_light.svg",
    dark: "/homepage-graphics/08_template_dark.svg",
  },
  books: {
    light: "/homepage-graphics/09_reading_light.svg",
    dark: "/homepage-graphics/10_reading_dark.svg",
  },
};

export function EditorialSection({
  index,
  title,
  description,
  status,
  href,
  action,
  graphic,
}: EditorialSectionProps) {
  const graphicKind = graphic?.kind;
  const layout = [
    styles.section,
    graphicKind === "onboarding" ? styles.feature : "",
    graphicKind === "thermal" || graphicKind === "templates"
      ? styles.reverse
      : "",
    graphicKind === "books" ? styles.compact : "",
    graphic ? "" : styles.withoutGraphic,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      className={layout}
      data-graphic={graphicKind}
      data-testid="home-editorial-section"
    >
      <p className={styles.index}>{index}</p>
      <Link href={href} className={styles.link}>
        <h2>{title}</h2>
        <p className={styles.description}>{description}</p>
        <p className={styles.status}>{status}</p>
        <span className={styles.action}>
          {action}
          <ArrowUpRight aria-hidden="true" focusable="false" size={20} />
        </span>
        {graphic ? <EditorialGraphic graphic={graphic} /> : null}
      </Link>
    </section>
  );
}

function EditorialGraphic({ graphic }: { graphic: EditorialGraphic }) {
  const assets = graphicAssets[graphic.kind];
  const width = 1448;
  const height = 1086;

  return (
    <span className={styles.graphic}>
      <svg
        aria-hidden="true"
        focusable="false"
        data-testid={`home-graphic-${graphic.kind}`}
        viewBox={`0 0 ${width} ${height}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <image
          className={styles.lightAsset}
          data-theme-asset="light"
          href={assets.light}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
        />
        <image
          className={styles.darkAsset}
          data-theme-asset="dark"
          href={assets.dark}
          width={width}
          height={height}
          preserveAspectRatio="xMidYMid meet"
        />
      </svg>
    </span>
  );
}
