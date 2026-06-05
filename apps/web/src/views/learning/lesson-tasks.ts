export type LessonTask = { title: string; description?: string };

export function extractLessonTasks(blocks: Array<{ type: string; payload: Record<string, unknown> }>): LessonTask[] {
  return blocks.flatMap((block) => {
    if (block.type !== "lesson_tasks" || !Array.isArray(block.payload.tasks)) {
      return [];
    }

    return block.payload.tasks.flatMap((rawTask) => {
      if (!rawTask || typeof rawTask !== "object") {
        return [];
      }
      const task = rawTask as Record<string, unknown>;
      const title = typeof task.title === "string" ? task.title.trim() : "";
      const description = typeof task.description === "string" ? task.description.trim() : "";
      if (!title) {
        return [];
      }
      return [{ title, ...(description ? { description } : {}) }];
    });
  });
}
