import { pipe } from 'effect';
import { obsessions, skills } from './constants';
import { App, InstructionResult, Obsession } from './types';
import { shuffleArray, splitIntoChunks, updateElementInArray } from './utils';
import { callClaudeConverse } from '../server/awsClaudeConverse';
import { callStableImage } from '../server/awsImageCall';

export type UpdateAppState = (prev: App) => Promise<App>;

// a player joins the lobby
export const playerJoinLobby =
  (nickname: string): UpdateAppState =>
  prev => {
    if (prev.kind !== 'waitingLobby') return Promise.resolve(prev);

    return Promise.resolve({
      ...prev,
      players: [...prev.players, { nickname }],
    });
  };

// once all players are in the lobby, someone clicks submit
export const waitingToPicking = (): UpdateAppState => prev => {
  if (prev.kind !== 'waitingLobby') return Promise.resolve(prev);

  const eachPlayerObsessionOptions = pipe(
    obsessions,
    shuffleArray,
    splitIntoChunks(prev.players.length),
  );
  return Promise.resolve({
    kind: 'pickingPeriod',
    players: prev.players.map(({ nickname }, i) => ({
      nickname,
      skills: null,
      obsession: null,
      skillOptions: skills,
      obsessionOptions: eachPlayerObsessionOptions[i],
    })),
  });
};

// a player selects their skills and obsession
export const playerSkillObsessionSelect =
  (
    nickname: string,
    skillOne: string,
    skillTwo: string,
    obsession: Obsession,
  ): UpdateAppState =>
  prev => {
    if (prev.kind !== 'pickingPeriod') return Promise.resolve(prev);

    const newPlayers = updateElementInArray(
      prev.players,
      p => ({ ...p, skills: { one: skillOne, two: skillTwo }, obsession }),
      p => p.nickname === nickname,
    );

    return Promise.resolve({ ...prev, players: newPlayers });
  };

// if everyone is done picking, move to bidding
export const maybeFinishPicking = (): UpdateAppState => prev => {
  if (prev.kind !== 'pickingPeriod') return Promise.resolve(prev);
  const everyoneDone = prev.players.every(
    p => p.obsession !== null && p.skills !== null,
  );
  return everyoneDone
    ? Promise.resolve({
        kind: 'bidding',
        imageURL: null,
        history: [],
        players: prev.players.map(p => ({
          nickname: p.nickname,
          willpower: 10,
          skills: p.skills!,
          points: 0,
          obsession: p.obsession!,
          bidAmount: null,
        })),
      })
    : Promise.resolve(prev);
};

// a player decides their bid
export const playerBid =
  (nickname: string, bidAmt: number): UpdateAppState =>
  prev => {
    if (prev.kind !== 'bidding') return Promise.resolve(prev);

    return Promise.resolve({
      ...prev,
      players: updateElementInArray(
        prev.players,
        p => ({ ...p, bidAmount: bidAmt }),
        p => p.nickname === nickname,
      ),
    });
  };

// if everyone is done bidding, move to bidding tie
// if no tie, move to control
export const maybeFinishBidding = (): UpdateAppState => async prev => {
  if (prev.kind !== 'bidding') return Promise.resolve(prev);

  const everyoneDone = prev.players.every(p => p.bidAmount !== null);

  if (!everyoneDone) return Promise.resolve(prev);

  const highestBidAmt = prev.players.reduce(
    (max, p) => Math.max(max, p.bidAmount!),
    0,
  );

  const highestBids = prev.players.filter(p => p.bidAmount === highestBidAmt);
  const lowerBids = prev.players.filter(p => p.bidAmount !== highestBidAmt);
  const isATie = highestBids.length > 1;

  if (isATie) {
    const newPlayers = [
      ...highestBids.map(p => ({
        ...p,
        bidAmount: p.bidAmount!,
        tieStatus: { kind: 'tie' as const, roll: null },
      })),
      ...lowerBids.map(p => ({
        ...p,
        bidAmount: p.bidAmount!,
        tieStatus: { kind: 'noTie' as const },
      })),
    ];

    return Promise.resolve({
      kind: 'biddingTie',
      imageURL: prev.imageURL,
      history: prev.history,
      players: newPlayers,
    });
  }

  // NOTE this is duped with maybeFinishBidding
  const historyWithWinner = [
    ...prev.history,
    `CONTEST: ${highestBids[0].nickname} won the contest, and took control of John.`,
  ];

  const scenario =
    prev.history.length === 0
      ? await callClaudeConverse(
          [
            `John has gotten himself into a peculiar situation. Come up with the situation and set the scene for the players, describing what John sees and make sure to leave lots of opportunities for player agency. Do not describe John's actions.`,
          ],
          `You are a Game Master for the TTRPG “Everyone is John.” In 4 sentences, your job is to describe the current situation of the protagonist, John. Describe in detail, the setting in which John wakes up. Be creative and imaginative. The story should take place in the modern day and should not have any somber or scary elements. It should feel like a light action comedy. Your output should consist only of text a narrator would say. Speak in the present tense.`,
          500,
        )
      : await callClaudeConverse(
          historyWithWinner.slice(-10),
          `You are a Game Master for the TTRPG “Everyone is John.” In ten words or less, describe the current situation of the protagonist, John. Continue where the provided history left off. Do not repeat any of it. Your output should consist only of text a narrator would say. Speak in the present tense. End with “What do you do?”`,
          300,
        );

  const newHistory = [...historyWithWinner, scenario];

  const summary = await callClaudeConverse(
    [scenario],
    `You are a prompt writer for an Image diffusion Model for a game of Everyone is John. Create a prompt that showcases the last thing John did, given the action provided. John is a middle aged clean shaven white man with brown hair and brown eyes. The image should be in an animated disney pixar style. Keep your prompt concise and fewer than 3 sentences. The image model only has the context you provide.`,
  );

  const generatedImageURL = await callStableImage(summary);

  return Promise.resolve({
    kind: 'control',
    imageURL: generatedImageURL,
    history: newHistory,
    controlPlayer: {
      nickname: highestBids[0].nickname,
      willpower: highestBids[0].willpower - highestBids[0].bidAmount!,
      skills: highestBids[0].skills,
      points: highestBids[0].points,
      obsession: highestBids[0].obsession,
      instruction: null,
    },
    otherPlayers: lowerBids.map(p => ({
      nickname: p.nickname,
      willpower: p.willpower,
      skills: p.skills,
      points: p.points,
      obsession: p.obsession,
    })),
  });
};

// a player rolls a die to break the bidding tie
export const playerSubmitTieRoll =
  (nickname: string, roll: number): UpdateAppState =>
  prev => {
    if (prev.kind !== 'biddingTie') return Promise.resolve(prev);

    const newPlayers = updateElementInArray(
      prev.players,
      p => ({
        ...p,
        tieStatus: { kind: 'tie' as const, roll },
      }),
      p => p.nickname === nickname,
    );
    return Promise.resolve({ ...prev, players: newPlayers });
  };

// if everyone is done rolling their tie dice, move to control
export const maybeFinishTieRoll = (): UpdateAppState => async prev => {
  if (prev.kind !== 'biddingTie') return Promise.resolve(prev);

  const everyoneDone = prev.players.every(
    p => p.tieStatus.kind === 'noTie' || p.tieStatus.roll !== null,
  );
  console.log(`checking if tie roll done. everyone done: ${everyoneDone}`);

  if (!everyoneDone) return Promise.resolve(prev);

  const hadTieRoll = prev.players.filter(p => p.tieStatus.kind === 'tie');
  const highestTieRoll = hadTieRoll.reduce(
    (max, p) =>
      Math.max(max, (p.tieStatus as { kind: 'tie'; roll: number }).roll),
    0,
  );
  const winners = prev.players.filter(
    p => p.tieStatus.kind === 'tie' && p.tieStatus.roll === highestTieRoll,
  );
  const nonWinners = prev.players.filter(
    p => p.tieStatus.kind === 'noTie' || p.tieStatus.roll !== highestTieRoll,
  );

  if (winners.length > 1) {
    const newPlayers = [
      ...winners.map(p => ({
        ...p,
        tieStatus: { kind: 'tie' as const, roll: null },
      })),
      ...nonWinners.map(p => ({
        ...p,
        tieStatus: { kind: 'noTie' as const },
      })),
    ];

    return Promise.resolve({
      ...prev,
      players: newPlayers,
    });
  }

  // NOTE this is duped with maybeFinishBidding
  const historyWithWinner = [
    ...prev.history,
    `CONTEST: ${winners[0].nickname} won the contest, and took control of John.`,
  ];

  console.log('about to ask claude for a scenario...');
  const scenario =
    prev.history.length === 0
      ? await callClaudeConverse(
          [
            `John has gotten himself into a peculiar situation. Come up with the situation and set the scene for the players, describing what John sees and make sure to leave lots of opportunities for player agency. Do not describe John's actions.`,
          ],
          `You are a Game Master for the TTRPG “Everyone is John.” In 4 sentences, your job is to describe the current situation of the protagonist, John. Describe in detail, the setting in which John wakes up. Be creative and imaginative. The story should take place in the modern day and should not have any somber or scary elements. It should feel like a light action comedy. Your output should consist only of text a narrator would say. Speak in the present tense.`,
          500,
        )
      : await callClaudeConverse(
          historyWithWinner.slice(-10),
          `You are a Game Master for the TTRPG “Everyone is John.” In ten words or less, describe the current situation of the protagonist, John. Continue where the provided history left off. Do not repeat any of it. Your output should consist only of text a narrator would say. Speak in the present tense. End with “What do you do?”`,
          300,
        );

  const newHistory = [...historyWithWinner, scenario];

  const summary = await callClaudeConverse(
    [scenario],
    `You are a prompt writer for an Image diffusion Model for a game of Everyone is John. Create a prompt that showcases the last thing John did, given the action provided. John is a middle aged clean shaven white man with brown hair and brown eyes. The image should be in an animated disney pixar style. Keep your prompt concise and fewer than 3 sentences. The image model only has the context you provide.`,
  );
  const generatedImageURL = await callStableImage(summary);
  console.log('received scenario and image.');

  return Promise.resolve({
    kind: 'control',
    imageURL: generatedImageURL,
    history: newHistory,
    controlPlayer: {
      nickname: winners[0].nickname,
      willpower: winners[0].willpower - winners[0].bidAmount,
      skills: winners[0].skills,
      points: winners[0].points,
      obsession: winners[0].obsession,
      instruction: null,
    },
    otherPlayers: nonWinners.map(p => ({
      nickname: p.nickname,
      willpower: p.willpower,
      skills: p.skills,
      points: p.points,
      obsession: p.obsession,
    })),
  });
};

export const userIssuesControlInstruction =
  (instruction: string): UpdateAppState =>
  async prev => {
    if (prev.kind !== 'control' && prev.kind !== 'skillCheck')
      return Promise.resolve(prev);

    const response = await callClaudeConverse(
      [
        ...prev.history.slice(-10),
        `INSTRUCTION: ${instruction}\nPLAYER DETAILS:\nSkills: ${prev.controlPlayer.skills.one}, ${prev.controlPlayer.skills.two}\nObsession: ${prev.controlPlayer.obsession.description}`,
      ],
      `You are an API that determines the next state of a ttrpg game of "Everyone is John." You will receive some context about the last things that happened in the game. You will receive information about the player's skills and obsession. You will also receive a new instruction from a player. Based on this context, you will generate a response that conforms to the following rules: your response will consist only of a JSON string that matches this schema: {“description”: “string”, “result”: { “kind”: “skillCheckWithAdvantage“ } | { “kind”: “skillCheck“ } | { “kind”: “okayNext” } | { “kind”: “fallAsleep” } | { “kind”: “obsessionsCompleted”}}. For uncertain tasks that require any amount of skill to accomplish, you should prompt the player for a skill check. If they have skills unrelated to the task, the result should be a skillCheck, otherwise the result will be skillCheckWithAdvantage if one of their skills applies. Do not grant advantage unless you can justify it in the description. If there is no skill check required, determine if the task results in completing the player's obsession by returning an obsessionsCompleted result. If no obsessions are completed and no skillcheck is required, return an okayNext result. Your output must be in valid JSON format with no other text: {“description”: “string”, “result”: { “kind”: “skillCheckWithAdvantage” } | { “kind”: “skillCheck” } | { “kind”: “okayNext” } | { “kind”: “fallAsleep” } | { “kind”: “obsessionsCompleted” }}.`,
    );

    // based on user data and existing history
    const result = JSON.parse(response) as InstructionResult;

    const summary = await callClaudeConverse(
      [result.description],
      `You are a prompt writer for an Image diffusion Model for a game of Everyone is John. Create a prompt that showcases the last thing John did, given the action provided. John is a middle aged clean shaven white man with brown hair and brown eyes. The image should be in an animated disney pixar style. Keep your prompt concise and fewer than 3 sentences. The image model only has the context you provide.`,
    );

    const generatedImageURL = await callStableImage(summary);

    if (result.result.kind === 'okayNext') {
      return Promise.resolve({
        ...prev,
        imageURL: generatedImageURL,
        history: [...prev.history, result.description],
      });
    }

    if (result.result.kind === 'fallAsleep') {
      return Promise.resolve({
        kind: 'bidding',
        imageURL: generatedImageURL,
        history: [...prev.history, result.description],
        players: [
          ...prev.otherPlayers.map(p => ({
            nickname: p.nickname,
            willpower: p.willpower + 1,
            skills: p.skills,
            points: p.points,
            obsession: p.obsession,
            bidAmount: null,
          })),
          {
            nickname: prev.controlPlayer.nickname,
            willpower: prev.controlPlayer.willpower + 1,
            skills: prev.controlPlayer.skills,
            points: prev.controlPlayer.points,
            obsession: prev.controlPlayer.obsession,
            bidAmount: null,
          },
        ],
      });
    }

    if (
      result.result.kind === 'skillCheck' ||
      result.result.kind === 'skillCheckWithAdvantage'
    ) {
      return Promise.resolve({
        kind: 'skillCheck',
        imageURL: generatedImageURL,
        history: [...prev.history, result.description],
        advantage: result.result.kind === 'skillCheckWithAdvantage',
        controlPlayer: {
          ...prev.controlPlayer,
          willpowerAdded: 0,
          rollResult: null,
        },
        otherPlayers: [...prev.otherPlayers],
      });
    }

    if (result.result.kind === 'obsessionsCompleted') {
      return Promise.resolve({
        kind: 'bidding',
        imageURL: generatedImageURL,
        history: [...prev.history, result.description],
        players: [
          ...prev.otherPlayers.map(p => ({ ...p, bidAmount: null })),
          {
            ...prev.controlPlayer,
            points:
              prev.controlPlayer.points + prev.controlPlayer.obsession.rank,
            bidAmount: null,
          },
        ],
      });
    }

    throw 'this should never happen';
  };

export const attemptSkillCheck =
  (willpowerAdded: number, rollResult: number): UpdateAppState =>
  prev => {
    if (prev.kind !== 'skillCheck') return Promise.resolve(prev);

    const computedRoll = rollResult + willpowerAdded;
    const isSuccess = prev.advantage ? computedRoll >= 3 : computedRoll >= 6;

    console.log(
      `attempting skill check, roll of ${computedRoll}, success: ${isSuccess}`,
    );

    if (isSuccess) {
      const test = userIssuesControlInstruction(
        `SKILL CHECK: ${prev.controlPlayer.nickname} succeeds the skill check`,
      );
      return test(prev);
    } else {
      const newHistory = [
        ...prev.history,
        `SKILL CHECK: ${prev.controlPlayer.nickname} failed the skill check`,
      ];
      return Promise.resolve({
        kind: 'bidding',
        imageURL: prev.imageURL,
        history: newHistory,
        players: [
          ...prev.otherPlayers.map(p => ({ ...p, bidAmount: null })),
          { ...prev.controlPlayer, bidAmount: null },
        ],
      });
    }
  };
