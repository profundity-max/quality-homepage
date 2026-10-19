"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { watermarkImage } from "@/modules/content-protection";
import styles from "./article-protection.module.css";

/** 只包裹阅读内容，不改变共享正文在后台预览中的行为。 */
export function ArticleProtection({
  watermark,
  restrict,
  children,
}: {
  watermark: string;
  restrict: boolean;
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!restrict) return;
    const preventProtectedOperation = (event: Event) => {
      const root = content.current;
      const target = event.target;
      if (!root) return;
      // 不干扰页面其他区域的搜索、反馈输入或可编辑控件。
      if (
        target instanceof Element &&
        target.closest('input,textarea,[contenteditable="true"]')
      )
        return;
      const selection = window.getSelection();
      const touchesSelection =
        selection &&
        Array.from({ length: selection.rangeCount }, (_, i) =>
          selection.getRangeAt(i),
        ).some((range) => !range.collapsed && range.intersectsNode(root));
      if ((target instanceof Node && root.contains(target)) || touchesSelection)
        event.preventDefault();
    };
    document.addEventListener("copy", preventProtectedOperation, true);
    document.addEventListener("cut", preventProtectedOperation, true);
    document.addEventListener("dragstart", preventProtectedOperation, true);
    return () => {
      document.removeEventListener("copy", preventProtectedOperation, true);
      document.removeEventListener("cut", preventProtectedOperation, true);
      document.removeEventListener(
        "dragstart",
        preventProtectedOperation,
        true,
      );
    };
  }, [restrict]);

  return (
    <div
      ref={content}
      className={`${styles.protected} ${restrict ? styles.restricted : ""}`}
      data-content-protection=""
      data-watermark={watermark}
      data-restrict-copy={restrict ? "true" : "false"}
      style={
        {
          "--watermark-light": watermarkImage(watermark, "light"),
          "--watermark-dark": watermarkImage(watermark, "dark"),
        } as CSSProperties
      }
      onContextMenu={restrict ? (event) => event.preventDefault() : undefined}
      onDragStart={restrict ? (event) => event.preventDefault() : undefined}
    >
      {children}
    </div>
  );
}
