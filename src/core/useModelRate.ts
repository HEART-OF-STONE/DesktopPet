import {useRef} from 'react';
import type {AgentTask,IntegrationSnapshot} from './integrations';
import {sampleModelRate,type RateSampleState} from './modelRate';

export function useModelRate(data:IntegrationSnapshot|undefined,task:AgentTask|undefined,now:number){
  const sample=useRef<RateSampleState|undefined>(undefined);
  sample.current=sampleModelRate(sample.current,data,task,now);
  return sample.current.value;
}
