export type QueuedOperation={operationId:string;state:'pending'|'conflict';error?:string};

// A receipt is persisted before the next network write. If persisting it fails,
// the durable queue still contains the same operation ID for safe server replay.
export async function replayQueue<T extends QueuedOperation>(
  queue:T[],send:(operation:T)=>Promise<void>,persist:(remaining:T[])=>Promise<void>,
):Promise<T[]> {
  let remaining=[...queue];
  for(const operation of queue){
    if(operation.state==='conflict')continue;
    try {await send(operation);}
    catch(error){
      const status=(error as {status?:number}).status;
      // Authentication, timeout and rate limits can recover without editing the write.
      if(status&&status>=400&&status<500&&![401,408,429].includes(status)){
        remaining=remaining.map(item=>item.operationId===operation.operationId?{...item,state:'conflict',error:error instanceof Error?error.message:'Sync requires review.'}:item);
        await persist(remaining);continue;
      }
      throw error;
    }
    remaining=remaining.filter(item=>item.operationId!==operation.operationId);
    await persist(remaining);
  }
  return remaining;
}
