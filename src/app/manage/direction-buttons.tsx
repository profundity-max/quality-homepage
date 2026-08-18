import styles from "./manage.module.css";

export function DirectionButtons({
  action,
  idName,
  idValue,
  labelPrefix,
}: {
  action: (formData: FormData) => Promise<void>;
  idName: string;
  idValue: string;
  labelPrefix: string;
}) {
  return (
    <>
      <form action={action}>
        <input type="hidden" name={idName} value={idValue} />
        <input type="hidden" name="direction" value="up" />
        <button
          aria-label={`${labelPrefix} 上移`}
          className={styles.textButton}
          type="submit"
        >
          ↑
        </button>
      </form>
      <form action={action}>
        <input type="hidden" name={idName} value={idValue} />
        <input type="hidden" name="direction" value="down" />
        <button
          aria-label={`${labelPrefix} 下移`}
          className={styles.textButton}
          type="submit"
        >
          ↓
        </button>
      </form>
    </>
  );
}
