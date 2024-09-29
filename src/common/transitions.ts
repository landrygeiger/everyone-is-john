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

// export const userSkillCheck =
//   (instruction: string): UpdateAppState =>
//   async prev => {
//     {
//       throw 'TODO';
//     }
//   };

const cleanRes = (str: string): boolean => {
  return str.toLowerCase().replace('"', '').replace("'", '') === 'true';
};

export const userIssuesControlInstruction =
  (instruction: string): UpdateAppState =>
  async prev => {
    {
      if (prev.kind !== 'control' && prev.kind !== 'skillCheck')
        return Promise.resolve(prev);

      if (prev.kind === 'skillCheck') {
        if (instruction.substring(0, 7) === 'SUCCESS') {
          const description = await callClaudeConverse(
            [...prev.history.slice(-10), `INSTRUCTION: ${instruction}`],
            `You are a game master in the ttrpg “Everyone is John”. John has successfully taken a specific course of action. The player’s instruction is provided along with a brief history of the game. Do not repeat any of this history, simply explain what happens when John completes the action described in the instruction.`,
          );

          const summary = await callClaudeConverse(
            [description],
            `You are a prompt writer for an Image diffusion Model for a game of Everyone is John. Create a prompt that showcases the last thing John did, given the action provided. John is a middle aged clean shaven white man with brown hair and brown eyes. The image should be in an animated disney pixar style. Keep your prompt concise and fewer than 3 sentences. The image model only has the context you provide.`,
          );

          const generatedImageURL = await callStableImage(summary);

          const completesObsession = await callClaudeConverse(
            [
              ...prev.history.slice(-3),
              `INSTRUCTION: ${instruction}`,
              `OBSESSION: ${prev.controlPlayer.obsession}`,
            ],
            `You are a game master in the ttrpg “Everyone is John”. A player has taken a specific course of action and you must decide if by performing this action they have completed their “obsession” or not. An “obsession” is an objective that the player wishes to complete. If the description of the player’s action includes a successful fulfillment of their obsession, return “true”. If the description does not directly include the obsession, return “false”. Your response must be the string “true” or “false”.`,
            1,
          );

          if (cleanRes(completesObsession)) {
            return Promise.resolve({
              kind: 'bidding',
              imageURL: generatedImageURL,
              history: [...prev.history, description],
              players: [
                ...prev.otherPlayers.map(p => ({ ...p, bidAmount: null })),
                {
                  ...prev.controlPlayer,
                  points:
                    prev.controlPlayer.points +
                    prev.controlPlayer.obsession.rank,
                  bidAmount: null,
                },
              ],
            });
          } else {
            return Promise.resolve({
              ...prev,
              kind: 'control',
              imageURL: generatedImageURL,
              history: [...prev.history, description],
            });
          }
        }
      }

      const isSkillCheck = await callClaudeConverse(
        [...prev.history.slice(-3), `INSTRUCTION: ${instruction}`],
        `You are a game master in the ttrpg “Everyone is John”. A player has requested to take a specific course of action and you must decide if they need to make a skill check in order to determine their success. You will receive an instruction from the user and a brief history of the gameplay. You will only return the string “true” or “false”. If the action could be difficult for an average person or requires a specific set of skills, you should return “true”, indicating a skill check must take place. If the action is reasonable for an average person, return “false,” indicating play can continue as normal. Your response must be the string “true” or “false”.`,
        1,
      );

      if (cleanRes(isSkillCheck)) {
        const isAdvSkillCheck = await callClaudeConverse(
          [
            ...prev.history.slice(-3),
            `INSTRUCTION: ${instruction}`,
            `SKILLS: ${prev.controlPlayer.skills.one}, ${prev.controlPlayer.skills.two}`,
          ],
          `You are a game master in the ttrpg “Everyone is John”. A player has requested to take a specific course of action and it has been determined that they must make a skill check. You will receive the instruction from the user, a brief history of the gameplay, and the player’s two special skills. You must decide if their skills match the requested course of action. If either of the skills seem closely related to the requested course of action (the instruction), return “true.” If the skills are not related or only loosely related, return “false.” Your response must be the string “true” or “false”.`,
          1,
        );
        if (cleanRes(isAdvSkillCheck)) {
          const description = await callClaudeConverse(
            [...prev.history.slice(-10), `INSTRUCTION: ${instruction}`],
            `You are a game master in the ttrpg “Everyone is John”. A player has taken a specific course of action that results in a skillcheck. You must explain what happens and prompt the user to complete the skillcheck. You will receive some history of the gamestate and a user’s instruction along with their skills. The outcome of this instruction is currently uncertain. In 10 words or less, set the scene and prompt the user to make a skill check, using the most relevant of their provided skills in your description.`,
          );

          const summary = await callClaudeConverse(
            [description],
            `You are a prompt writer for an Image diffusion Model for a game of Everyone is John. Create a prompt that showcases the last thing John did, given the action provided. John is a middle aged clean shaven white man with brown hair and brown eyes. The image should be in an animated disney pixar style. Keep your prompt concise and fewer than 3 sentences. The image model only has the context you provide.`,
          );

          const generatedImageURL = await callStableImage(summary);

          return Promise.resolve({
            kind: 'skillCheck',
            imageURL: generatedImageURL,
            history: [...prev.history, description],
            advantage: true,
            controlPlayer: {
              ...prev.controlPlayer,
              willpowerAdded: 0,
              rollResult: null,
            },
            otherPlayers: [...prev.otherPlayers],
          });
        } else {
          const description = await callClaudeConverse(
            [...prev.history.slice(-10), `INSTRUCTION: ${instruction}`],
            `You are a game master in the ttrpg “Everyone is John”. A player has taken a specific course of action that results in a skillcheck. You must explain what happens and prompt the user to complete the skillcheck. You will receive some history of the gamestate and a user’s instruction. The outcome of this instruction is currently uncertain. In 10 words or less, set the scene and prompt the user to make a skill check.`,
          );

          const summary = await callClaudeConverse(
            [description],
            `You are a prompt writer for an Image diffusion Model for a game of Everyone is John. Create a prompt that showcases the last thing John did, given the action provided. John is a middle aged clean shaven white man with brown hair and brown eyes. The image should be in an animated disney pixar style. Keep your prompt concise and fewer than 3 sentences. The image model only has the context you provide.`,
          );

          const generatedImageURL = await callStableImage(summary);

          return Promise.resolve({
            kind: 'skillCheck',
            imageURL: generatedImageURL,
            history: [...prev.history, description],
            advantage: false,
            controlPlayer: {
              ...prev.controlPlayer,
              willpowerAdded: 0,
              rollResult: null,
            },
            otherPlayers: [...prev.otherPlayers],
          });
        }
      } else {
        const description = await callClaudeConverse(
          [...prev.history.slice(-10), `INSTRUCTION: ${instruction}`],
          `You are a game master in the ttrpg “Everyone is John”. John has successfully taken a specific course of action. The player’s instruction is provided along with a brief history of the game. Do not repeat any of this history, simply explain what happens when John completes the action described in the instruction.`,
        );

        const summary = await callClaudeConverse(
          [description],
          `You are a prompt writer for an Image diffusion Model for a game of Everyone is John. Create a prompt that showcases the last thing John did, given the action provided. John is a middle aged clean shaven white man with brown hair and brown eyes. The image should be in an animated disney pixar style. Keep your prompt concise and fewer than 3 sentences. The image model only has the context you provide.`,
        );

        const generatedImageURL = await callStableImage(summary);

        const completesObsession = await callClaudeConverse(
          [
            ...prev.history.slice(-3),
            `INSTRUCTION: ${instruction}`,
            `OBSESSION: ${prev.controlPlayer.obsession}`,
          ],
          `You are a game master in the ttrpg “Everyone is John”. A player has taken a specific course of action and you must decide if by performing this action they have completed their “obsession” or not. An “obsession” is an objective that the player wishes to complete. If the description of the player’s action includes a successful fulfillment of their obsession, return “true”. If the description does not directly include the obsession, return “false”. Your response must be the string “true” or “false”.`,
          1,
        );

        if (cleanRes(completesObsession)) {
          return Promise.resolve({
            kind: 'bidding',
            imageURL: generatedImageURL,
            history: [...prev.history, description],
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
        } else {
          return Promise.resolve({
            ...prev,
            imageURL: generatedImageURL,
            history: [...prev.history, description],
          });
        }
      }

      // throw(`This should never happen`)
    }
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
        `SUCCESS: ${prev.controlPlayer.nickname} succeeds the skill check`,
      );
      return test(prev);
    } else {
      const newHistory = [
        ...prev.history,
        `FAILURE: ${prev.controlPlayer.nickname} failed the skill check`,
      ];
      return Promise.resolve({
        kind: 'bidding',
        imageURL: prev.imageURL,
        history: newHistory,
        players: [
          ...prev.otherPlayers.map(p => ({ ...p, bidAmount: null })),
          {
            ...prev.controlPlayer,
            willpower: prev.controlPlayer.willpower - willpowerAdded,
            bidAmount: null,
          },
        ],
      });
    }
  };
