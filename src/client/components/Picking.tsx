import { FC, useContext } from 'react';
import { App } from '../../common/types';
import { Card, Typography } from '@mui/joy';
import SkillSelection from './SkillSelection';
import { StateContext } from '../State';
import { selectKit } from '../../common/api';

type Props = {
  pickingState: Extract<App, { kind: 'pickingPeriod' }>;
};
const Picking: FC<Props> = ({ pickingState }) => {
  const { nickname } = useContext(StateContext);
  const me = pickingState.players.find(p => p.nickname === nickname)!;
  const doneSelecting = me.skills !== null && me.obsession !== null;

  return (
    <Card>
      {doneSelecting ? (
        <Typography level="h2">
          Waiting for everyone else to pick their skills and obsession...
        </Typography>
      ) : (
        <SkillSelection
          skills={me?.skillOptions ?? []}
          obsessions={me?.obsessionOptions ?? []}
          onSubmit={(selectedSkills, selectedObsession) =>
            selectKit({
              nickname: nickname ?? '',
              obsession: selectedObsession,
              skillOne: selectedSkills[0],
              skillTwo: selectedSkills[1],
            })
          }
        />
      )}
    </Card>
  );
};

export default Picking;
