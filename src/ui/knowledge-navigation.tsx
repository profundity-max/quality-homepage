import Link from "next/link";
import type { SectionNode } from "@/modules/knowledge-publishing";
import type { KnowledgeContext } from "./knowledge-navigation-model";
import styles from "./knowledge-navigation.module.css";

type Props = {
  root: SectionNode;
  destinationPath: KnowledgeContext["destinationPath"];
  selectedTopicStableId: string;
};

export function KnowledgeNavigation(props: Props) {
  return (
    <>
      <aside className={styles.desktop} aria-label="知识导航">
        <h2 className={styles.heading}>知识导航</h2>
        <Tree {...props} section={props.root} />
      </aside>
      <details className={styles.compact}>
        <summary>分类导航</summary>
        <nav aria-label="分类导航">
          <Tree {...props} section={props.root} />
        </nav>
      </details>
    </>
  );
}

function Tree({
  section,
  destinationPath,
  selectedTopicStableId,
}: Props & { section: SectionNode }) {
  return (
    <ul className={styles.tree}>
      {section.topics.map((topic) => (
        <li key={topic.id}>
          <Link
            href={`${destinationPath}?topic=${encodeURIComponent(topic.stableId)}`}
            aria-current={
              topic.stableId === selectedTopicStableId ? "page" : undefined
            }
          >
            {topic.name}
          </Link>
        </li>
      ))}
      {section.children.map((child) => (
        <li key={child.id}>
          <details open>
            <summary>{child.name}</summary>
            <Tree
              root={child}
              section={child}
              destinationPath={destinationPath}
              selectedTopicStableId={selectedTopicStableId}
            />
          </details>
        </li>
      ))}
    </ul>
  );
}
