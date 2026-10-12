import type { Campaign, CampaignWorld, Quest, QuestDifficulty, StatRewards } from "./types";

export type GeneratedLesson = {
  id: string;
  title: string;
  description: string;
  difficulty: "easy" | "standard" | "hard" | "boss";
  estimatedMinutes: number;
  xpReward: number;
  type: "lesson" | "boss";
  prerequisites: string[];
};

export type GeneratedStage = {
  id: string;
  title: string;
  description: string;
  lessons: GeneratedLesson[];
  bossProject: GeneratedLesson;
};

export type GeneratedCampaign = {
  title: string;
  description: string;
  estimatedWeeks: number;
  stages: GeneratedStage[];
};

type MaterializedCampaign = {
  campaign: Campaign;
  worlds: CampaignWorld[];
  quests: Quest[];
};

const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 42) || "campaign";

const difficultyMap: Record<GeneratedLesson["difficulty"], QuestDifficulty> = {
  easy: "Easy",
  standard: "Standard",
  hard: "Hard",
  boss: "Boss",
};

function statRewards(difficulty: QuestDifficulty): StatRewards {
  const base = difficulty === "Boss" ? 4 : difficulty === "Hard" ? 3 : difficulty === "Standard" ? 2 : 1;
  return { Learning: base, Discipline: base, Creativity: difficulty === "Boss" ? 2 : 1 };
}

export function generatedCampaignId(title: string) {
  return `generated-${slug(title)}-${Date.now().toString(36)}`;
}

export function materializeGeneratedCampaign(source: GeneratedCampaign, id = generatedCampaignId(source.title)): MaterializedCampaign {
  const lessonIds = new Map<string, string>();
  const worlds: CampaignWorld[] = source.stages.map((stage, index) => ({
    id: `${id}-stage-${index + 1}`,
    campaignId: id,
    title: stage.title,
    subtitle: `Stage ${index + 1}`,
    description: stage.description,
    order: index + 1,
    bossQuestId: `${id}-boss-${index + 1}`,
    status: index === 0 ? "available" : "locked",
  }));

  source.stages.forEach((stage, stageIndex) => {
    stage.lessons.forEach((lesson, lessonIndex) => {
      lessonIds.set(lesson.id, `${id}-lesson-${stageIndex + 1}-${lessonIndex + 1}`);
    });
  });

  const quests: Quest[] = [];
  let previousBossId: string | null = null;
  source.stages.forEach((stage, stageIndex) => {
    const world = worlds[stageIndex];
    let previousLessonId: string | null = previousBossId;

    stage.lessons.forEach((lesson, lessonIndex) => {
      const idForLesson = lessonIds.get(lesson.id) ?? `${id}-lesson-${stageIndex + 1}-${lessonIndex + 1}`;
      const requestedPrerequisites = lesson.prerequisites
        .map((prerequisite) => lessonIds.get(prerequisite))
        .filter((prerequisite): prerequisite is string => Boolean(prerequisite) && prerequisite !== idForLesson);
      const prerequisites = Array.from(new Set([...requestedPrerequisites, ...(previousLessonId ? [previousLessonId] : [])]));
      const difficulty = difficultyMap[lesson.difficulty];
      quests.push({
        id: idForLesson,
        campaignId: id,
        worldId: world.id,
        title: lesson.title,
        description: lesson.description,
        difficulty,
        estimatedMinutes: lesson.estimatedMinutes,
        xpReward: lesson.xpReward,
        status: "locked",
        prerequisites,
        statRewards: statRewards(difficulty),
        focusPrompt: lesson.description,
        focusSeconds: 0,
        xpEarned: 0,
        statEarned: {},
      });
      previousLessonId = idForLesson;
    });

    const boss = stage.bossProject;
    const bossId = world.bossQuestId;
    const difficulty = "Boss";
    quests.push({
      id: bossId,
      campaignId: id,
      worldId: world.id,
      title: boss.title.startsWith("Boss:") ? boss.title : `Boss: ${boss.title}`,
      description: boss.description,
      difficulty,
      estimatedMinutes: boss.estimatedMinutes,
      xpReward: boss.xpReward,
      status: "locked",
      prerequisites: previousLessonId ? [previousLessonId] : previousBossId ? [previousBossId] : [],
      statRewards: statRewards(difficulty),
      focusPrompt: boss.description,
      focusSeconds: 0,
      xpEarned: 0,
      statEarned: {},
    });
    previousBossId = bossId;
  });

  return {
    campaign: {
      id,
      title: source.title,
      subtitle: "Forged campaign",
      description: source.description,
      level: worlds[0]?.title ?? "First steps",
      progress: 0,
      completed: 0,
      total: quests.length,
      color: "from-teal-400 to-emerald-300",
      stage: worlds[0]?.title ?? "First steps",
      primaryStats: ["Learning", "Discipline", "Creativity"],
      generated: true,
      estimatedWeeks: source.estimatedWeeks,
      sourceGoal: source.title,
    },
    worlds,
    quests,
  };
}
