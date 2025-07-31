import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'FastMath2';

// Hardcoded tab-separated data for email to focusTrack mapping
const mappingData = `aheli.shah@alpha.school	TRACK8
annabelle.meegan@alpha.school	TRACK8
kavin.lingham@alpha.school	TRACK7
lincoln.thomas@alpha.school	TRACK5
austin.way@alpha.school	TRACK8
caleb.walker@alpha.school	TRACK5
cruce.saunders@alpha.school	TRACK8
luka.scaletta@alpha.school	TRACK6
sloane.price@alpha.school	TRACK8
clara.aboelnil@alpha.school	TRACK8
juan.ortega@alpha.school	TRACK6
luna.montagna@alpha.school	TRACK6
isabella.barba@alpha.school	TRACK7
jason.montagna@alpha.school	TRACK6
penelope.marty@alpha.school	TRACK6
sydney.barba@alpha.school	TRACK8
leo.montagna@alpha.school	TRACK6
magnus.liodden@alpha.school	TRACK6
aleina.boyce@alpha.school	TRACK6
alessandra.green@alpha.school	TRACK8
alyan.slizza@alpha.school	TRACK6
anaya.lenington@alpha.school	TRACK8
atlas.kloiber@alpha.school	TRACK6
aubrey.curtis@alpha.school	TRACK8
dsean.harden@alpha.school	TRACK6
david.nolan@alpha.school	TRACK8
david.paul@alpha.school	TRACK7
donnie.moore@alpha.school	TRACK8
duke.ajouz@alpha.school	TRACK8
elaina.robertson@alpha.school	TRACK6
george.troxell@alpha.school	TRACK6
hazel.salton@alpha.school	TRACK6
isabelle.moncure@alpha.school	TRACK6
jaxon.siers@alpha.school	TRACK8
lukas.siers@alpha.school	TRACK6
max.vaughan@alpha.school	TRACK6
miles.kozun@alpha.school	TRACK7
reed.robertson@alpha.school	TRACK8
tate.price@alpha.school	TRACK6
wyatt.signor@alpha.school	TRACK7
zion.clark@alpha.school	TRACK7
armin.rouwet@alpha.school	TRACK6
byron.attridge@alpha.school	TRACK8
connor.cason@alpha.school	TRACK6
dario.ramos@alpha.school	TRACK8
eddie.margainjunco@alpha.school	TRACK5
electra.green@alpha.school	TRACK8
elle.griswold@alpha.school	TRACK6
ellen.meegan@alpha.school	TRACK6
kaiden.szpitalak@alpha.school	TRACK6
kira.fuerst@alpha.school	TRACK6
love.lalla-pagan@alpha.school	TRACK8
parker.carlson@alpha.school	TRACK8
sam.ratcliff@alpha.school	TRACK6
sylvi.hagman@alpha.school	TRACK6
vayda.hendle@alpha.school	TRACK8
zaid.qunibi@alpha.school	TRACK8
aoife.moore@alpha.school	TRACK8
benjamin.valles@alpha.school	TRACK7
ella.mcmurry@alpha.school	TRACK6
greyson.walker@alpha.school	TRACK8
gwendolyn.meegan@alpha.school	TRACK8
hannah.brown@alpha.school	TRACK8
jack.cotner@alpha.school	TRACK5
jackson.wiley@alpha.school	TRACK7
jacob.kuchinsky@alpha.school	TRACK8
lucian.klinefelter@alpha.school	TRACK8
madeline.moncure@alpha.school	TRACK8
madeline.kozun@alpha.school	TRACK8
michaeljohn.sewell@alpha.school	TRACK8
parker.pesek@alpha.school	TRACK8
phineas.parrott@alpha.school	TRACK6
rhys.bjorendahl@alpha.school	TRACK8
sawyer.jayasuriya@alpha.school	TRACK5
townes.vanzandt@alpha.school	TRACK6
zayen.szpitalak@alpha.school	TRACK6
zephyr.sharpe@alpha.school	TRACK8
brooke.tracy@alpha.school	TRACK6
james.gregory@alpha.school	TRACK6
raphael.shinar@alpha.school	TRACK8
rivers.yong@alpha.school	TRACK6
aiden.richardson@alpha.school	TRACK6
anthem.thomas@alpha.school	TRACK6
bandon.peterson@alpha.school	TRACK6
blake.price@alpha.school	TRACK6
diego.bash@alpha.school	TRACK6
eleanor.paul@alpha.school	TRACK6
gia.clark@alpha.school	TRACK8
gideon.griffin@alpha.school	TRACK6
jacob.signor@alpha.school	TRACK6
jimmy.moore@alpha.school	TRACK6
mallory.hobart@alpha.school	TRACK6
milam.morgan@alpha.school	TRACK6
odeya.shinar@alpha.school	TRACK8
ren.sticker@alpha.school	TRACK6
rory.salton@alpha.school	TRACK8
thomas.loftus@alpha.school	TRACK6
vivian.ajouz@alpha.school	TRACK6
willa.rubenstein@alpha.school	TRACK6
evelyn.gabler@alpha.school	TRACK8
logan.campbell@alpha.school	TRACK6
ramsey.levin@alpha.school	TRACK6
sarah.hunter@alpha.school	TRACK6
lavender.marrero@alpha.school	TRACK6
lily.gray@alpha.school	TRACK6
marcus.fuentes@alpha.school	TRACK6
orion.campbell@alpha.school	TRACK6
raegan.middleton@alpha.school	TRACK8
sander.gabler@alpha.school	TRACK7
savannah.marrero@alpha.school	TRACK8
abigail.hunter@alpha.school	TRACK6
amelia.gabler@alpha.school	TRACK6
aster.burns@alpha.school	TRACK6
cj.wright@alpha.school	TRACK6
virginia.gray@alpha.school	TRACK6
zarielle.vela@alpha.school	TRACK6
sebastian.salazar@alpha.school	TRACK8
elijah.hunter@alpha.school	TRACK6
emery.cox@alpha.school	TRACK8
ethan.bale@alpha.school	TRACK6
landon.thach@alpha.school	TRACK6
victoria.leal@alpha.school	TRACK6
vigo.levin@alpha.school	TRACK6
zoey.peden@alpha.school	TRACK6
edward.qu@alpha.school	TRACK6
felix.cole@nextgenacademy.school	TRACK8
xavier.siddall@nextgenacademy.school	TRACK6
everest.nevraumont@2hourlearning.com	TRACK6
nate.evans@2hourlearning.com	TRACK8
mara.nevraumont@2hourlearning.com	TRACK8
calvin.barraza@2hourlearning.com	TRACK6
eric.kenez@2hourlearning.com	TRACK6
jules.nevraumont@2hourlearning.com	TRACK6
alexander.wiebeck@2hourlearning.com	TRACK6
gray.duffy@2hourlearning.com	TRACK8
jack.henry@2hourlearning.com	TRACK8
joanna.victorian@2hourlearning.com	TRACK6
gameela.campbell@2hourlearning.com	TRACK6
roman-parker.davis@2hourlearning.com	TRACK8
scotty.noel@alpha.school	TRACK6
shepherd.rogersmora@2hourlearning.com	TRACK6
alannah.carrion@2hourlearning.com	TRACK8
bailey-grace.davis@2hourlearning.com	TRACK6
diana.kostov@2hourlearning.com	TRACK8
edgar.shinar@alpha.school	TRACK6
hortense.puddlefoot@2hourlearning.com	TRACK7
knox.wheeler@2hourlearning.com	TRACK6
amelia.lucas@2hourlearning.com	TRACK6
tatiana.carrion@2hourlearning.com	TRACK8
brett.noel@alpha.school	TRACK6
levi.reeves@sportsacademy.school	TRACK6
marshall.jensen@alpha.school	TRACK8
omar.ibarra@sportsacademy.school	TRACK6
aksel.jensen@alpha.school	TRACK8
jovanni.hernandez@sportsacademy.school	TRACK6
stone.meyers@sportsacademy.school	TRACK6
jet.butterworth@sportsacademy.school	TRACK6
silaswalker.roughton@alpha.school	TRACK8
corinne.mcgowan@sportsacademy.school	TRACK6
elizabella.hernandez@sportsacademy.school	TRACK6
lucius.walker@alpha.school	TRACK6
north.griswold@sportsacademy.school	TRACK7
alaynah.marquez@2hourlearning.com	TRACK6
alfat.shirzoi.hamidi@2hourlearning.com	TRACK6
amariah.johnson@2hourlearning.com	TRACK6
angel.gonzalez-romero@2hourlearning.com	TRACK6
carla.tarra-palacios@2hourlearning.com	TRACK6
jarius.collins@2hourlearning.com	TRACK6
rafat.shirzoi.hamidi@2hourlearning.com	TRACK6
raymond.allen@2hourlearning.com	TRACK6
ysabella.ramos@2hourlearning.com	TRACK6
gabriel.leal.barrios@2hourlearning.com	TRACK6
gavin.johnson@2hourlearning.com	TRACK6
isabella.payan@2hourlearning.com	TRACK6
jalayah.washington@2hourlearning.com	TRACK6
johana.dsantiago-verastegui@2hourlearning.com	TRACK6
leoxinelys.campos-ferrebus@2hourlearning.com	TRACK6
mikyi.alexander@2hourlearning.com	TRACK6
santiago.mosquera-rodriguez@2hourlearning.com	TRACK6
tanill.bills@2hourlearning.com	TRACK6
terranae.turner@2hourlearning.com	TRACK6
mya.hadnot@2hourlearning.com	TRACK6
nehemiah.wilburn@2hourlearning.com	TRACK6
shamiya.johnson@2hourlearning.com	TRACK6
treyon.toussaint@2hourlearning.com	TRACK6
jax.luebke@sportsacademy.school	TRACK6
mekhayll.joudrey@alpha.school	TRACK6
emma.schipper@alpha.school	TRACK6
alyieah.sneed@2hourlearning.com	TRACK6
love.daceus.celius@2hourlearning.com	TRACK6
landen.goikhman@nextgenacademy.school	TRACK6
lucas.sanner@2hourlearning.com	TRACK8
ariel.martel@2hourlearning.com	TRACK6
ezel.pereznellar@2hourlearning.com	TRACK6
ethan.wong@alpha.school	TRACK8
keyen.gupta@2hourlearning.com	TRACK7
lucy.peden@alpha.school	TRACK6
cahlani.lewis@2hourlearning.com	TRACK6
brooklyn.allred@alpha.school	TRACK6
helio.ortiz@alpha.school	TRACK8
zane.rogers@sportsacademy.school	TRACK6
stella.cole@alpha.school	TRACK6
alex.lekicbrajovic@sportsacademy.school	TRACK6
chloe.sperbmachadoneto@alpha.school	TRACK6
jazaiah.wilburn@2hourlearning.com	TRACK6
kamila.gonzalez-romero@2hourlearning.com	TRACK6
geraldine.gurrola@alpha.school	TRACK6
oliver.overton@alpha.school	TRACK6
sarah.schipper@alpha.school	TRACK6
dillinmar.lugo.marquez@2hourlearning.com	TRACK6
asher.hazard@alpha.school	TRACK6
brady.york@alpha.school	TRACK6
elena.mentgen@alpha.school	TRACK8
eva.mentgen@alpha.school	TRACK6
ian.mentgen@alpha.school	TRACK8
maddie.baehr@alpha.school	TRACK6
maya.inkinen@alpha.school	TRACK8
olivia.monsalvebonotto@alpha.school	TRACK6
sirkanden.freeman@2hourlearning.com	TRACK6
aleiah.jenkins@2hourlearning.com	TRACK6
megan.chukwura@2hourlearning.com	TRACK6
kinzie.campbell@2hourlearning.com	TRACK6
josi.posillico@alpha.school	TRACK6
faustina.ngambo-kialengele@2hourlearning.com	TRACK6
braeden.conn@sportsacademy.school	TRACK6
johnny.darcy@alpha.school	TRACK6
kadence.phariss@sportsacademy.school	TRACK6
owen.conn@sportsacademy.school	TRACK6
eastwood.washburn@sportsacademy.school	TRACK6
thiaggo.rodriguez@2hourlearning.com	TRACK6
ella.dietz@alpha.school	TRACK8
javierjulian.baez@sportsacademy.school	TRACK6
jack.porto@2hourlearning.com	TRACK6
leyson.bryant@2hourlearning.com	TRACK6
ryan.porto@2hourlearning.com	TRACK6
sawyer.bryant@2hourlearning.com	TRACK7
sai.shah@alpha.school	TRACK6
kigen.gray@novatio.school	TRACK6
legend.smith@2hourlearning.com	TRACK6
hendrix.smith@2hourlearning.com	TRACK6
anthonella.ochoa@2hourlearning.com	TRACK6`;

async function createFocusTrackMapping(): Promise<void> {
  const mappings: { [email: string]: string } = {};
  let count = 0;
  
  // Process the tab-separated data
  const lines = mappingData.split('\n');
  for (const line of lines) {
    if (line.trim()) {
      const [email, focusTrack] = line.trim().split('\t');
      if (email && focusTrack) {
        mappings[email.toLowerCase().trim()] = focusTrack.trim();
        count++;
      }
    }
  }
  
  console.log(`Processed ${count} email-to-focusTrack mappings`);
  
  // Create a single DynamoDB item containing all mappings
  const focusTrackMappingItem = {
    PK: 'MAPPING#FOCUSMAPPING',
    SK: 'METADATA',
    mappingId: 'FOCUSMAPPING',
    lastUpdated: new Date().toISOString(),
    mappings: mappings
  };
  
  try {
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: focusTrackMappingItem
    });
    
    await docClient.send(command);
    console.log('Successfully created focus track mapping item in DynamoDB');
  } catch (error) {
    console.error('Error creating focus track mapping:', error);
    throw error;
  }
}

async function main() {
  try {
    await createFocusTrackMapping();
    console.log('Focus track mapping creation completed');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 