export const declarations = `Единицы:
Oil = STB/day
Water = bbl/day at surface conditions
Gas = standard scf/day
Pwf = psi`
export const table = `Well\tMonth\tOil\tWater\tGas\tPwf
W-01\tJan\t900\t100\t270000\t310
W-01\tApr\t800\t180\t250000\t300
W-01\tJul\t690\t280\t220000\t290
W-01\tOct\t580\t390\t190000\t280
W-02\tJan\t750\t250\t180000\t295
W-02\tApr\t690\t320\t175000\t286
W-02\tJul\t630\t390\t165000\t275
W-02\tOct\t570\t470\t160000\t263
W-03\tJan\t550\t80\t110000\t320
W-03\tApr\t540\t95\t109000\t318
W-03\tJul\t520\t110\t108000\t315
W-03\tOct\t495\t140\t104000\t312
W-04\tJan\t600\t400\t300000\t270
W-04\tApr\t555\t500\t285000\t258
W-04\tJul\t500\t600\t280000\t245
W-04\tOct\t440\t700\t265000\t232
W-05\tJan\t480\t120\t120000\t300
W-05\tApr\t510\t105\t118000\t301
W-05\tJul\t560\t90\t122000\t300
W-05\tOct\t590\t80\t127000\t299
W-06\tJan\t720\t180\t200000\t330
W-06\tApr\t680\t200\t188000\t324
W-06\tJul\t625\t240\t178000\t319
W-06\tOct\t565\t290\t168000\t310`
export const prompt = `@Malik Oil AI Проанализируй синтетические нефтяные данные. Рассчитай WC, WOR, GOR, падение добычи и давление. Построй графики.\n${declarations}\n\n${table}`
