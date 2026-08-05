import TopBar from '../components/TopBar';
import PlanPicker from '../components/PlanPicker';
import './choose-plan.css';

export default function ChoosePlan() {
  return (
    <>
      <TopBar title="Choose a plan" subtitle="30 days free, no card required — pick whenever you're ready" />
      <div className="cp-body">
        <PlanPicker />
      </div>
    </>
  );
}
