import { useEffect } from 'react';
import { activeCareer, matchFinished, quitMatch, useGame } from './store/game';
import { setSoundEnabled } from './ui/sound';
import { useClubColours } from './ui/components/Bits';
import { MatchScreen } from './ui/match/MatchScreen';
import { CareerScreen } from './ui/screens/CareerScreen';
import { Create } from './ui/screens/Create';
import { FullTime } from './ui/screens/FullTime';
import { Hub } from './ui/screens/Hub';
import { Penalties } from './ui/screens/Penalties';
import { PreMatch } from './ui/screens/PreMatch';
import { SeasonEnd } from './ui/screens/SeasonEnd';
import { Table } from './ui/screens/Table';
import { Title } from './ui/screens/Title';
import { Training } from './ui/screens/Training';
import { Transfer } from './ui/screens/Transfer';

/**
 * Superstar's screens, switched on a field in the store. No router: the whole game is one page,
 * which keeps hosting it under a sub-path simple.
 */
export function App() {
  const screen = useGame((s) => s.screen);
  const career = useGame(activeCareer);
  const match = useGame((s) => s.match);
  useClubColours(screen === 'title' || screen === 'create' ? null : career?.clubId);

  useEffect(() => {
    setSoundEnabled(career?.sound ?? true);
  }, [career?.sound]);

  // A new screen starts at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  if (screen === 'create') return <Create />;
  if (!career || screen === 'title') return <Title />;

  switch (screen) {
    case 'prematch':
      return <PreMatch career={career} />;
    case 'match':
      return match ? (
        <MatchScreen
          key={match.setup.seed}
          setup={match.setup}
          scene={match.scene}
          sound={career.sound}
          showHelp={career.matches.length < 3}
          onFinish={matchFinished}
          onQuit={quitMatch}
        />
      ) : (
        <Hub career={career} />
      );
    case 'penalties':
      return <Penalties career={career} />;
    case 'fulltime':
      return <FullTime career={career} />;
    case 'transfer':
      return <Transfer career={career} />;
    case 'season-end':
      return <SeasonEnd career={career} />;
    case 'table':
      return <Table career={career} />;
    case 'training':
      return <Training career={career} />;
    case 'career':
      return <CareerScreen career={career} />;
    case 'hub':
    default:
      return <Hub career={career} />;
  }
}
