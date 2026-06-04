"use client";

import { ChapterForm } from "./chapter-form";
import { LessonForm } from "./lesson-form";
import { ModuleForm } from "./module-form";
import type { EducationMutation, LearningModule, Selection, SetEducationSelection } from "./types";
import { findChapter, findLesson } from "./utils";

export function DetailPanel({
  selection,
  modules,
  onSelect,
  onMutate,
}: {
  selection: Selection;
  modules: LearningModule[];
  onSelect: SetEducationSelection;
  onMutate: EducationMutation;
}) {
  if (selection.kind === "none") {
    return <p className="page-subtitle">Выберите модуль, главу или урок слева.</p>;
  }
  if (selection.kind === "module") {
    const module = modules.find((candidate) => candidate.id === selection.id);
    if (!module) return <p className="page-subtitle">Модуль не найден.</p>;
    return <ModuleForm module={module} onMutate={onMutate} />;
  }
  if (selection.kind === "chapter") {
    const chapter = findChapter(modules, selection.id);
    if (!chapter) return <p className="page-subtitle">Глава не найдена.</p>;
    return <ChapterForm chapter={chapter} onMutate={onMutate} />;
  }
  const lesson = findLesson(modules, selection.id);
  if (!lesson) return <p className="page-subtitle">Урок не найден.</p>;
  const chapter = findChapter(modules, lesson.chapterId);
  return (
    <LessonForm
      key={lesson.id}
      lesson={lesson}
      moduleId={chapter?.moduleId ?? null}
      onMutate={onMutate}
      onSelect={onSelect}
    />
  );
}
