// ===================================================================
// Jenkinsfile (Final Production-Ready Version)
// UPDATED: Corrected the 'timeout' unit from 'h' to 'HOURS'.
// ===================================================================

pipeline {
    agent any

    tools {
        // The tool type must be enclosed in quotes because it contains dots.
        'hudson.plugins.sonar.SonarRunnerInstallation' 'SonarScanner-latest'
    }

    environment {
        AWS_REGION        = 'us-west-2'
        ECR_REGISTRY      = '889818960214.dkr.ecr.us-west-2.amazonaws.com'
        ECR_REPO_NAME     = 'my-app-repo'
        EKS_CLUSTER_NAME  = 'my-eks-cluster'
        
        SONAR_CREDENTIALS = credentials('sonar-token')
        AWS_CREDENTIALS_ID = 'aws-credentials' 
    }

    stages {
        
        stage('Checkout') {
            steps {
                script {
                    echo "Checking out code from branch: ${env.BRANCH_NAME}"
                    checkout scm
                }
            }
        }

        stage('SonarQube Analysis') {
            steps {
                script {
                    withSonarQubeEnv('MySonarQubeServer') { 
                        sh 'sonar-scanner'
                    }
                }
            }
            post {
                success {
                    script {
                        // --- THIS IS THE CRUCIAL CORRECTION ---
                        // The time unit must be in uppercase (e.g., HOURS, MINUTES, SECONDS).
                        timeout(time: 1, unit: 'HOURS') {
                            def qg = waitForQualityGate()
                            if (qg.status != 'OK') {
                                error "Pipeline aborted due to SonarQube Quality Gate failure: ${qg.status}"
                            }
                        }
                    }
                }
            }
        }

        stage('Build, Scan & Push Images') {
            parallel {
                stage('Backend') {
                    steps {
                        dir('backend') {
                            script {
                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-backend-${env.BUILD_ID}"
                                
                                def backendImage = docker.build(imageName, '.')

                                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"

                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    backendImage.push()
                                }
                            }
                        }
                    }
                }
                stage('Frontend') {
                    steps {
                        dir('frontend') {
                            script {
                                def imageName = "${ECR_REGISTRY}/${ECR_REPO_NAME}:3tier-nodejs-frontend-${env.BUILD_ID}"
                                
                                def frontendImage = docker.build(imageName, '.')

                                sh "trivy image --exit-code 1 --severity HIGH,CRITICAL ${imageName}"
                                
                                docker.withRegistry("https://${ECR_REGISTRY}", "ecr:${env.AWS_REGION}:${AWS_CREDENTIALS_ID}") {
                                    frontendImage.push()
                                }
                            }
                        }
                    }
                }
            }
        }

        stage('Deploy to EKS') {
            steps {
                script {
                    withAWS(credentials: AWS_CREDENTIALS_ID, region: env.AWS_REGION) {
                        
                        sh "aws eks update-kubeconfig --name ${EKS_CLUSTER_NAME} --region ${env.AWS_REGION}"

                        sh """
                            helm upgrade --install my-app ./helm/my-app \
                                --namespace default \
                                --set backend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} \
                                --set backend.image.tag=3tier-nodejs-backend-${env.BUILD_ID} \
                                --set frontend.image.repository=${ECR_REGISTRY}/${ECR_REPO_NAME} \
                                --set frontend.image.tag=3tier-nodejs-frontend-${env.BUILD_ID}
                        """
                    }
                }
            }
        }
    }
}
