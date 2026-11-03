export const colors={paper:'#F7F6F2',paperRaised:'#FFFFFF',ink:'#202627',muted:'#60666A',subtle:'#6D7275',green:'#45685C',greenSoft:'#EAF0EC',amber:'#876126',amberSoft:'#F7F0E3',line:'#E3E3DE',input:'#A0A5A4',danger:'#A13F3B',stone:'#EEEDE8',sand:'#D6C8B8',onInk:'#FAF8F3'} as const;

export const spacing={xs:4,sm:8,md:16,lg:24,xl:32} as const;
export const radius={input:12,card:18,pill:999} as const;
export const surface={backgroundColor:colors.paperRaised,borderWidth:1,borderColor:colors.line,borderRadius:radius.card,padding:20};
export const screen={flexGrow:1 as const,paddingHorizontal:24,paddingTop:20,paddingBottom:32,backgroundColor:colors.paper};
export const typography={eyebrow:{fontSize:11,color:colors.muted,fontWeight:'700' as const,letterSpacing:1.8},heading:{fontSize:30,lineHeight:37,fontWeight:'700' as const,color:colors.ink,marginTop:8},muted:{fontSize:14,color:colors.muted,lineHeight:21}};
export const input={minHeight:48,borderWidth:1,borderColor:colors.input,borderRadius:radius.input,padding:12,fontSize:16,color:colors.ink,backgroundColor:colors.paperRaised};
